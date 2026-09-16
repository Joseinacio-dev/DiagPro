import { Usb, Smartphone, AlertTriangle, WifiOff, Loader2, Layers, Battery } from 'lucide-react'
import './DeviceCard.css'

function DeviceCard({ estado }) {
  const status = estado?.status || 'waiting'

  if (status === 'waiting' || status === 'disconnected') {
    return (
      <div className="dp-device-state">
        <Usb size={32} className="dp-device-state-icon waiting" />
        <p className="dp-device-state-title">Aguardando dispositivo</p>
        <p className="dp-device-state-desc">Conecte um dispositivo Android pelo cabo USB.</p>
      </div>
    )
  }

  if (status === 'unauthorized') {
    return (
      <div className="dp-device-state">
        <AlertTriangle size={32} className="dp-device-state-icon warning" />
        <p className="dp-device-state-title">Autorização necessária</p>
        <p className="dp-device-state-desc">
          Desbloqueie o celular e confirme “Permitir depuração USB”. Se disponível, marque “Sempre permitir deste computador”.
        </p>
        <div className="dp-device-state-pulse">
          <Loader2 size={14} className="spin" /> Aguardando autorização...
        </div>
      </div>
    )
  }

  if (status === 'offline') {
    return (
      <div className="dp-device-state">
        <WifiOff size={32} className="dp-device-state-icon warning" />
        <p className="dp-device-state-title">Dispositivo offline</p>
        <p className="dp-device-state-desc">Reconectando ao dispositivo… Se não reconectar, retire e conecte novamente o cabo USB.</p>
        <div className="dp-device-state-pulse"><Loader2 size={14} className="spin" /> Tentativa segura em andamento</div>
      </div>
    )
  }

  if (status === 'multiple') {
    return (
      <div className="dp-device-state">
        <Layers size={32} className="dp-device-state-icon warning" />
        <p className="dp-device-state-title">Múltiplos dispositivos detectados</p>
        <p className="dp-device-state-desc">Mais de um dispositivo foi encontrado. Selecione o aparelho que deseja analisar.</p>
        <div className="dp-device-options" role="list" aria-label="Dispositivos encontrados">
          {(estado.devices || []).map((device) => (
            <button key={device.serial} type="button" role="listitem" onClick={() => estado.selectDevice?.(device.serial)}>
              <Smartphone size={16} />
              <span><strong>{device.model || 'Modelo não disponível'}</strong><small>{device.serial}</small></span>
              <em>{device.status}</em>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (status === 'adb_unavailable') {
    return (
      <div className="dp-device-state">
        <AlertTriangle size={32} className="dp-device-state-icon error" />
        <p className="dp-device-state-title">ADB indisponível</p>
        <p className="dp-device-state-desc">ADB não está disponível no DiagPro.</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="dp-device-state">
        <AlertTriangle size={32} className="dp-device-state-icon error" />
        <p className="dp-device-state-title">Erro na detecção</p>
        <p className="dp-device-state-desc">Não foi possível verificar a conexão neste momento.</p>
      </div>
    )
  }

  if (status !== 'connected') {
    return (
      <div className="dp-device-state">
        <Usb size={32} className="dp-device-state-icon waiting" />
        <p className="dp-device-state-title">Aguardando dispositivo</p>
        <p className="dp-device-state-desc">Conecte um Android via USB com a depuração USB ativada.</p>
      </div>
    )
  }

  const nomeExibicao = estado.commercialModel || estado.model || 'Dispositivo Android'

  return (
    <div className="dp-device-body">
      <div className="dp-device-visual"><Smartphone size={64} /></div>

      <div className="dp-device-info">
        <h2>{estado.manufacturer} {nomeExibicao}</h2>
        <p className="dp-device-ready">Dispositivo conectado e pronto para análise.</p>

        <div className="dp-device-tags">
          <span><Smartphone size={14} /> Android {estado.androidVersion}</span>
          <span><Usb size={14} /> USB conectado</span>
        </div>

        <div className="dp-device-tags">
          <span>
            <Battery size={14} />
            Bateria: {estado.battery?.level != null ? `${estado.battery.level}%` : '--'}
          </span>
        </div>
      </div>

      <div className="dp-device-quickinfo">
        <div className="dp-quickinfo-title">INFORMAÇÕES RÁPIDAS</div>
        <div><span>Modelo</span><strong>{estado.model}</strong></div>
        <div><span>SDK Android</span><strong>{estado.sdk}</strong></div>
        <div><span>Serial</span><strong>{estado.serial}</strong></div>
      </div>
    </div>
  )
}

export default DeviceCard
