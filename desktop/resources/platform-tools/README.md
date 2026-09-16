# ADB distribuído com o DiagPro

Este diretório contém o subconjunto mínimo do Android SDK Platform Tools para
Windows usado pelo DiagPro beta. A origem é o pacote oficial do Google, versão
37.0.1 (`Pkg.Revision=37.0.1`):

https://developer.android.com/tools/releases/platform-tools

Arquivos distribuídos: `adb.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll`,
`NOTICE.txt`, `source.properties` e `MANIFEST.json`.

`fastboot` e as demais ferramentas do pacote não são incluídos. Os hashes do
conteúdo aprovado estão registrados no manifesto. O instalador copia esses
arquivos para `resources/platform-tools`, fora do ASAR, e o DiagPro prioriza
esse executável sobre instalações externas.

Drivers USB específicos do fabricante podem continuar sendo necessários no
Windows. A redistribuição comercial deve manter o `NOTICE.txt` e passar por
revisão jurídica dos termos do Android SDK antes da venda.
