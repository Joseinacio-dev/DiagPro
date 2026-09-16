const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const crypto = require('node:crypto')
const { createMaintenanceService } = require('./adb/maintenanceService')
const { createAdbClient } = require('./adb/adbClient')
const { createScanCoordinator } = require('./adb/scanCoordinator')
const { createPackageCollector } = require('./security/collectors/packageCollector')
const { createRemediationService } = require('./remediation/remediationService')

function bridge(outputs = {}) {
  const calls = []
  const adb = createAdbClient({ resolveExecutable: () => 'fixture-adb', execFileImpl: (_exe,args,_opts,cb) => {
    calls.push(args)
    const key = args.join(' ')
    const defaults = {
      'devices -l': 'SERIAL device',
      '-s SERIAL shell dumpsys battery': 'level: 70\nscale: 100\nstatus: 3\nhealth: 2\nvoltage: 4000\ntemperature: 300',
      '-s SERIAL shell df -k /data': 'Filesystem 1K-blocks Used Available Use% Mounted on\n/data 100000 40000 60000 40% /data',
      '-s SERIAL shell dumpsys diskstats': 'App Cache Size: 100',
      '-s SERIAL shell pm help': 'trim-caches DESIRED_FREE_SPACE',
      '-s SERIAL shell cat /proc/meminfo': 'MemTotal: 4000000 kB\nMemAvailable: 2000000 kB',
      '-s SERIAL shell dumpsys cpuinfo': '10% TOTAL: 10% user',
      '-s SERIAL shell getprop ro.build.version.sdk': '35',
      version: 'Android Debug Bridge version 1.0.41', help: ' pull remote local',
    }
    const value = Object.hasOwn(outputs,key) ? outputs[key] : defaults[key]
    if(value instanceof Error) return cb(value,'','device offline')
    if(value === undefined) throw Error('Unexpected ADB: '+key)
    cb(null,value,'')
  }})
  const handlers = {}
  const main = fs.readFileSync(__dirname+'/main.js','utf8')
  const scanCoordinator = createScanCoordinator()
  const sender = { mainFrame: { url: 'file:///trusted' } }
  const context = {
    ipcMain: { handle: (name,handler) => { handlers[name]=handler } },
    mainWindow: { isDestroyed: () => false, webContents: sender },
    isTrustedRendererUrl: url => url === 'file:///trusted', rendererTargetInfo: {}, logOperationalError: () => {},
    crypto, AbortController, scanCoordinator, maintenanceService: createMaintenanceService({adb}),
    validScanId: value => typeof value === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(value),
    productionLogger: null,
    releaseDeviceOperation: (serial,id) => scanCoordinator.finishOperation(serial,id),
    deviceBusyResponse: () => ({ok:false, code:'DEVICE_BUSY'}),
  }
  const trust = main.slice(main.indexOf('function trustedIpcHandler('),main.indexOf('function validScanId('))
  const handler = main.slice(main.indexOf("trustedIpcHandler('inspect-quick-action'"),main.indexOf("trustedIpcHandler('get-installed-apps'"))
  vm.runInNewContext(trust+'\n'+handler,context)
  const event = { sender, senderFrame: sender.mainFrame }
  let api
  vm.runInNewContext(fs.readFileSync(__dirname+'/preload.js','utf8'),{ require: name => {
    assert.equal(name,'electron')
    return {contextBridge:{exposeInMainWorld: (_name,value)=>{api=value}},ipcRenderer:{invoke:(channel,payload)=>handlers[channel](event,payload),on:()=>{},removeListener:()=>{}}}
  }})
  return {api,calls,scanCoordinator,invokeUntrusted:()=>handlers['inspect-quick-action']({sender:{},senderFrame:{url:'file:///untrusted'}},{serial:'SERIAL',action:'battery'})}
}

for(const action of ['cleanup','optimization','battery','backup']) test(`preload -> trusted main -> service -> ADB -> response: ${action}`,async()=>{
  const {api,calls,scanCoordinator}=bridge()
  const result=await api.inspectQuickAction({serial:'SERIAL',action,operationId:`operation-${action}`,command:'rm -rf'})
  assert.equal(result.ok,true)
  assert.equal(result.data.action,action)
  assert.equal(result.data.serial,'SERIAL')
  assert.equal(result.data.canExecute,false)
  assert.equal(result.data.coverage,'partial')
  assert.ok(result.data.sections.some(section=>section.status!=='unavailable'))
  assert.equal(scanCoordinator.getOperation('SERIAL'),null)
  assert.equal(calls.some(args=>args.includes('rm')||args.includes('pull')||args.includes('batterystats')),false)
})
test('IPC rejects untrusted sender without ADB',async()=>{
  const f=bridge(); await assert.rejects(f.invokeUntrusted(),/não autorizada/); assert.equal(f.calls.length,0)
})
test('maintenance respects device operation lock and releases after failures',async()=>{
  const f=bridge({'devices -l':'SERIAL unauthorized'})
  f.scanCoordinator.beginOperation('SERIAL','scan','existing')
  assert.equal((await f.api.inspectQuickAction({serial:'SERIAL',action:'battery',operationId:'operation-busy'})).code,'DEVICE_BUSY')
  assert.equal(f.calls.length,0)
  f.scanCoordinator.finishOperation('SERIAL','existing')
  assert.equal((await f.api.inspectQuickAction({serial:'SERIAL',action:'battery',operationId:'operation-unauthorized'})).code,'DEVICE_UNAUTHORIZED')
  assert.equal(f.scanCoordinator.getOperation('SERIAL'),null)
})
test('IPC does not turn unsupported battery output into a reading',async()=>{
  const f=bridge({'-s SERIAL shell dumpsys battery':'Permission Denial: level: 100'})
  const result=await f.api.inspectQuickAction({serial:'SERIAL',action:'battery',operationId:'operation-unsupported'})
  assert.equal(result.data.coverage,'unavailable')
  assert.deepEqual(result.data.sections[0].fields,[])
})

test('maintenance cancellation is scoped to the matching operation and device',async()=>{
  const f=bridge()
  const controller=new AbortController()
  f.scanCoordinator.beginOperation('SERIAL','maintenance','operation-cancel',{controller})
  assert.equal((await f.api.cancelQuickAction({serial:'OTHER',operationId:'operation-cancel'})).code,'OPERATION_NOT_FOUND')
  assert.equal(controller.signal.aborted,false)
  assert.equal((await f.api.cancelQuickAction({serial:'SERIAL',operationId:'operation-cancel'})).ok,true)
  assert.equal(controller.signal.aborted,true)
  f.scanCoordinator.finishOperation('SERIAL','operation-cancel')
})

function packages({user=10,lastUser=user,output='package:/data/app/base.apk=com.example.app'}={}) {
  const calls=[]; let checks=0
  const collector=createPackageCollector({adb:{runDevice:async(_serial,args)=>{calls.push(args); return args.includes('-3')?output:''}},deviceCollector:{collectAndroidUsers:async()=>({currentUserId:++checks===1?user:lastUser})}})
  return {calls,load:()=>collector.listInstalledApps('SERIAL',{currentUserOnly:true})}
}
test('app manager lists only current Android user without collecting app contents',async()=>{
  const f=packages(); const result=await f.load()
  assert.equal(result.currentUserId,10); assert.equal(result.items.length,1)
  assert.equal(f.calls.length,2); for(const args of f.calls) assert.deepEqual(args.slice(-2),['--user','10'])
})
for(const output of ['Permission Denial','Error: user does not exist','package:not a valid package']) test(`app list rejects invalid successful output: ${output}`,async()=>{
  await assert.rejects(packages({output}).load(),{code:'APPS_UNAVAILABLE'})
})
test('app list fails closed on missing user and profile switch',async()=>{
  const f=packages({user:null}); await assert.rejects(f.load(),{code:'ANDROID_USER_UNAVAILABLE'}); assert.equal(f.calls.length,0)
  await assert.rejects(packages({lastUser:11}).load(),{code:'ANDROID_USER_CHANGED'})
})

function removal({output='',apps=[],adminStatus='available',uninstall='Success'}={}) {
  return createRemediationService({
    listInstalledApps:async()=>({currentUserId:10,items:apps}),validateDevice:async()=>{},
    collectDeviceAdmins:async()=>({status:adminStatus,value:[]}),
    runAdb:async args=>args.includes('uninstall')?uninstall:output,
  })
}
const verifyArgs={serial:'SERIAL',packageName:'com.example.app',androidUserId:10}
for(const output of ['Permission Denial','Error: user 10 unavailable','garbage','package:invalid package']) test(`uninstall verification rejects ambiguous output: ${output}`,async()=>{
  const result=await removal({output}).verifyPackageAbsent(verifyArgs)
  assert.equal(result.status,'not_verified'); assert.equal(result.installed,null)
})
test('uninstall verification cross-checks list before claiming absence',async()=>{
  const result=await removal({apps:[{packageName:'com.example.app',type:'user'}]}).verifyPackageAbsent(verifyArgs)
  assert.equal(result.reason,'INCONSISTENT_VERIFICATION')
})
test('unavailable administrator check blocks removal preview',async()=>{
  await assert.rejects(removal({apps:[{packageName:'com.example.app',type:'user'}],output:'package:com.example.app',adminStatus:'not_available'}).createRemovalPreview(verifyArgs),{code:'ADMIN_STATE_UNAVAILABLE'})
})
test('uninstall mixed Success and error never counts as success',async()=>{
  const service=removal({apps:[{packageName:'com.example.app',type:'user'}],output:'package:com.example.app',uninstall:'Success\nFailure [BLOCKED]'})
  const preview=await service.createRemovalPreview(verifyArgs)
  await assert.rejects(service.executeUninstall({...verifyArgs,actionId:preview.actionId,confirmationToken:preview.confirmationToken}),{code:'UNINSTALL_FAILED'})
})

const { parseDeviceAdmins } = require('./security/parsers/securityParsers')
for (const output of ['', 'Permission denied', 'java.lang.SecurityException', 'unexpected OEM output']) test('admin parser fails closed: '+(output || 'empty'), () => {
  assert.equal(parseDeviceAdmins(output).status, 'not_available')
})
test('recognized device policy dump supports no active administrators', () => {
  assert.deepEqual(parseDeviceAdmins('Current Device Policy Manager state:\n  Enabled Device Admins (User 0, provisioningState: 0):'), {status:'available',value:[],reason:null})
})
