#requires -Version 7.0
<#
.SYNOPSIS
Aplica la topología APE 04 mediante la API Management local.
.EXAMPLE
./aplicar-ape04.ps1 -Administrador (Get-Credential) `
    -Integracion (Get-Credential -UserName ape04-integracion) `
    -Consulta (Get-Credential -UserName ape04-consulta)
.NOTES
Management debe estar activo en el puerto local 15672. Conserva las credenciales
fuera del repositorio. Las cuentas existentes conservan su contraseña.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][PSCredential] $Administrador,
    [Parameter(Mandatory)][PSCredential] $Integracion,
    [Parameter(Mandatory)][PSCredential] $Consulta
)

$ErrorActionPreference = 'Stop'
$vhost = 'ape04'
$exchange = 'ventas'
$cola = 'notificaciones.ventas'
$clave = 'venta.confirmada'

if ($Integracion.UserName -cne 'ape04-integracion' -or $Consulta.UserName -cne 'ape04-consulta') {
    throw 'Usa los nombres ape04-integracion y ape04-consulta.'
}

function Invoke-Management {
    param([string] $Metodo, [string] $Ruta, [hashtable] $Datos)

    $opciones = @{
        Uri = "http://127.0.0.1:15672/api/$Ruta"
        Method = $Metodo
        Credential = $Administrador
        Authentication = 'Basic'
        AllowUnencryptedAuthentication = $true
        TimeoutSec = 10
    }
    if ($null -ne $Datos) {
        $opciones.ContentType = 'application/json'
        $opciones.Body = ConvertTo-Json -InputObject $Datos -Depth 6 -Compress
    }
    try {
        Invoke-RestMethod @opciones
    } catch {
        $codigo = $_.Exception.Response?.StatusCode
        throw "Management rechazó $Metodo $Ruta (HTTP ${codigo}). Comprueba el acceso y la topología existente."
    }
}

$cuentas = @(
    @{ Credencial = $Integracion; Tags = @(); Escritura = '^ventas$'; Lectura = '^notificaciones\.ventas$' },
    @{ Credencial = $Consulta; Tags = @('management'); Escritura = '^$'; Lectura = '^$' }
)
$usuarios = Invoke-Management GET 'users'
foreach ($cuenta in $cuentas) {
    $nombre = $cuenta.Credencial.UserName
    $usuario = $usuarios | Where-Object name -CEQ $nombre
    $cuenta.Existe = $null -ne $usuario
    if ($cuenta.Existe) {
        $permisos = Invoke-Management GET "users/$nombre/permissions"
        if (($permisos | Where-Object vhost -CNE $vhost) -or
            (($usuario.tags | Sort-Object) -join ',') -cne (($cuenta.Tags | Sort-Object) -join ',')) {
            throw "La cuenta $nombre tiene permisos o etiquetas incompatibles."
        }
    }
}

$vhosts = Invoke-Management GET 'vhosts'
if ($vhost -cnotin $vhosts.name) {
    Invoke-Management PUT "vhosts/$vhost" @{} | Out-Null
}
Invoke-Management PUT "exchanges/$vhost/$exchange" @{
    type = 'direct'; durable = $true; auto_delete = $false; internal = $false; arguments = @{}
} | Out-Null
Invoke-Management PUT "queues/$vhost/$cola" @{
    durable = $true; auto_delete = $false; arguments = @{ 'x-queue-type' = 'classic' }
} | Out-Null

$rutaBinding = "bindings/$vhost/e/$exchange/q/$cola"
$bindings = Invoke-Management GET $rutaBinding
if (-not ($bindings | Where-Object { $_.routing_key -ceq $clave -and @($_.arguments.PSObject.Properties).Count -eq 0 })) {
    Invoke-Management POST $rutaBinding @{ routing_key = $clave; arguments = @{} } | Out-Null
}

foreach ($cuenta in $cuentas) {
    $nombre = $cuenta.Credencial.UserName
    if (-not $cuenta.Existe) {
        Invoke-Management PUT "users/$nombre" @{
            password = $cuenta.Credencial.GetNetworkCredential().Password
            tags = $cuenta.Tags -join ','
        } | Out-Null
    }
    Invoke-Management PUT "permissions/$vhost/$nombre" @{
        configure = '^$'; write = $cuenta.Escritura; read = $cuenta.Lectura
    } | Out-Null
}

Write-Output "Topología aplicada en $vhost. Exchange $exchange, cola $cola y clave $clave."
