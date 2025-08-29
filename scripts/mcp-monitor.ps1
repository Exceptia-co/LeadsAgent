# MCP Monitor Script para Warp Terminal
# Mantiene los servidores MCP activos y saludables
# Autor: Asistente AI para LeadsCRM
# Fecha: 2025-08-28

param(
    [switch]$Install,
    [switch]$Monitor,
    [switch]$Status,
    [switch]$Restart,
    [string]$LogPath = "$env:USERPROFILE\Desktop\LeadsAgent\logs\mcp-monitor.log"
)

# Configuración
$CONFIG = @{
    McpLogPath = "$env:USERPROFILE\AppData\Local\warp\Warp\data\logs\mcp"
    WarpProcessName = "warp"
    MonitorInterval = 30 # segundos
    RestartThreshold = 3 # reintentos antes de notificar
    RequiredServers = @(
        "serena",
        "mcp-server-fetch", 
        "mcp-server-sentry",
        "perplexity",
        "context7",
        "supabase"
    )
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    Write-Host $logEntry
    if (!(Test-Path (Split-Path $LogPath))) {
        New-Item -ItemType Directory -Path (Split-Path $LogPath) -Force | Out-Null
    }
    Add-Content -Path $LogPath -Value $logEntry
}

function Get-McpProcesses {
    return Get-Process | Where-Object {
        $_.ProcessName -like "*mcp*" -or 
        $_.ProcessName -like "*serena*" -or
        $_.ProcessName -like "*context*" -or
        $_.ProcessName -like "*perplexity*"
    }
}

function Test-WarpRunning {
    return (Get-Process -Name $CONFIG.WarpProcessName -ErrorAction SilentlyContinue) -ne $null
}

function Get-McpServerStatus {
    $processes = Get-McpProcesses
    $status = @{
        Running = $processes.Count
        Processes = @()
        Health = "Unknown"
    }
    
    foreach ($proc in $processes) {
        $status.Processes += @{
            Name = $proc.ProcessName
            Id = $proc.Id
            StartTime = $proc.StartTime
            WorkingSet = [math]::Round($proc.WorkingSet / 1MB, 2)
        }
    }
    
    # Determinar estado de salud
    if ($status.Running -eq 0) {
        $status.Health = "CRITICAL - No MCP servers running"
    } elseif ($status.Running -lt 3) {
        $status.Health = "WARNING - Few MCP servers running"
    } else {
        $status.Health = "HEALTHY - Multiple MCP servers active"
    }
    
    return $status
}

function Show-McpStatus {
    Write-Log "=== MCP SERVER STATUS ===" "INFO"
    
    if (!(Test-WarpRunning)) {
        Write-Log "❌ Warp Terminal no está ejecutándose" "ERROR"
        return
    }
    
    $status = Get-McpServerStatus
    Write-Log "🔍 Estado general: $($status.Health)" "INFO"
    Write-Log "📊 Procesos MCP activos: $($status.Running)" "INFO"
    
    if ($status.Processes.Count -gt 0) {
        Write-Log "📋 Procesos detallados:" "INFO"
        foreach ($proc in $status.Processes) {
            $uptime = if ($proc.StartTime) {
                $timeSpan = (Get-Date) - $proc.StartTime
                "$($timeSpan.Days)d $($timeSpan.Hours)h $($timeSpan.Minutes)m"
            } else { "Unknown" }
            
            Write-Log "  • $($proc.Name) (PID: $($proc.Id)) - Uptime: $uptime - RAM: $($proc.WorkingSet)MB" "INFO"
        }
    }
    
    # Verificar logs recientes
    if (Test-Path $CONFIG.McpLogPath) {
        $recentLogs = Get-ChildItem $CONFIG.McpLogPath | Sort-Object LastWriteTime -Descending | Select-Object -First 3
        Write-Log "📁 Logs MCP más recientes:" "INFO"
        foreach ($log in $recentLogs) {
            Write-Log "  • $($log.Name) - $($log.LastWriteTime)" "INFO"
        }
    }
}

function Test-McpHealth {
    # Verificar si los archivos de log están siendo escritos recientemente
    if (!(Test-Path $CONFIG.McpLogPath)) {
        return $false
    }
    
    $recentLogs = Get-ChildItem $CONFIG.McpLogPath | Where-Object {
        $_.LastWriteTime -gt (Get-Date).AddMinutes(-10)
    }
    
    return $recentLogs.Count -gt 0
}

function Start-McpMonitoring {
    Write-Log "🚀 Iniciando monitoreo de servidores MCP..." "INFO"
    Write-Log "⏱️  Intervalo de verificación: $($CONFIG.MonitorInterval) segundos" "INFO"
    Write-Log "🎯 Logs guardados en: $LogPath" "INFO"
    Write-Log "Press Ctrl+C to stop monitoring" "INFO"
    
    $restartCount = 0
    
    while ($true) {
        try {
            if (!(Test-WarpRunning)) {
                Write-Log "⚠️  Warp Terminal no está ejecutándose. Esperando..." "WARNING"
                Start-Sleep -Seconds $CONFIG.MonitorInterval
                continue
            }
            
            $status = Get-McpServerStatus
            Write-Log "📊 MCP Status: $($status.Running) processes running - $($status.Health)" "INFO"
            
            # Verificar salud de los servidores
            if ($status.Running -eq 0) {
                Write-Log "❌ No hay servidores MCP ejecutándose" "ERROR"
                $restartCount++
                
                if ($restartCount -ge $CONFIG.RestartThreshold) {
                    Write-Log "🚨 ALERTA: Demasiados fallos de MCP. Revisar configuración manual." "ERROR"
                    # Enviar notificación (opcional)
                    # Send-Notification "MCP servers failed multiple times"
                }
            } else {
                $restartCount = 0
            }
            
            Start-Sleep -Seconds $CONFIG.MonitorInterval
            
        } catch {
            Write-Log "❌ Error en el monitoreo: $($_.Exception.Message)" "ERROR"
            Start-Sleep -Seconds ($CONFIG.MonitorInterval * 2)
        }
    }
}

function Install-McpMonitor {
    Write-Log "📦 Instalando MCP Monitor como tarea programada..." "INFO"
    
    $scriptPath = $MyInvocation.ScriptName
    $taskName = "MCP-Monitor-LeadsCRM"
    
    # Crear directorio de logs
    $logDir = Split-Path $LogPath
    if (!(Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        Write-Log "📁 Creado directorio de logs: $logDir" "INFO"
    }
    
    try {
        # Verificar si ya existe la tarea
        $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($existingTask) {
            Write-Log "⚠️  La tarea '$taskName' ya existe. Eliminando..." "WARNING"
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        }
        
        # Crear nueva tarea programada
        $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-File `"$scriptPath`" -Monitor"
        $trigger = New-ScheduledTaskTrigger -AtStartup
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
        
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
        
        Write-Log "✅ Tarea programada '$taskName' creada exitosamente" "INFO"
        Write-Log "📋 La tarea se ejecutará automáticamente al inicio del sistema" "INFO"
        
    } catch {
        Write-Log "❌ Error instalando tarea programada: $($_.Exception.Message)" "ERROR"
    }
}

function Restart-McpServers {
    Write-Log "🔄 Reiniciando servidores MCP..." "INFO"
    
    # Nota: No podemos reiniciar directamente los servidores MCP ya que son manejados por Warp
    # En su lugar, proporcionamos instrucciones
    Write-Log "📋 Para reiniciar completamente los servidores MCP:" "INFO"
    Write-Log "  1. Cierra Warp Terminal completamente" "INFO"
    Write-Log "  2. Espera 5 segundos" "INFO"
    Write-Log "  3. Vuelve a abrir Warp Terminal" "INFO"
    Write-Log "  4. Los servidores MCP se reiniciarán automáticamente" "INFO"
    
    # Terminar procesos MCP huérfanos si existen
    $mcpProcesses = Get-McpProcesses
    if ($mcpProcesses.Count -gt 0) {
        Write-Log "🧹 Terminando procesos MCP huérfanos..." "INFO"
        foreach ($proc in $mcpProcesses) {
            try {
                Stop-Process -Id $proc.Id -Force
                Write-Log "  ✅ Terminado: $($proc.ProcessName) (PID: $($proc.Id))" "INFO"
            } catch {
                Write-Log "  ❌ No se pudo terminar: $($proc.ProcessName) - $($_.Exception.Message)" "ERROR"
            }
        }
    }
}

# MAIN SCRIPT EXECUTION
try {
    Write-Log "🚀 MCP Monitor Script iniciado" "INFO"
    Write-Log "📍 Ubicación del script: $($MyInvocation.MyCommand.Path)" "INFO"
    
    switch ($true) {
        $Install { Install-McpMonitor }
        $Monitor { Start-McpMonitoring }
        $Status { Show-McpStatus }
        $Restart { Restart-McpServers }
        default { 
            Write-Log "📋 Uso del script:" "INFO"
            Write-Log "  .\mcp-monitor.ps1 -Status    # Mostrar estado actual" "INFO"
            Write-Log "  .\mcp-monitor.ps1 -Monitor   # Iniciar monitoreo continuo" "INFO"
            Write-Log "  .\mcp-monitor.ps1 -Install   # Instalar como tarea programada" "INFO"
            Write-Log "  .\mcp-monitor.ps1 -Restart   # Limpiar procesos MCP" "INFO"
            Show-McpStatus
        }
    }
    
} catch {
    Write-Log "❌ Error crítico: $($_.Exception.Message)" "ERROR"
    exit 1
}
