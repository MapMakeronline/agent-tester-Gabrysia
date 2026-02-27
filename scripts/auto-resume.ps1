# Auto-Resume Agent Tester
#
# Uruchomienie:
#   .\auto-resume.ps1
#   .\auto-resume.ps1 -MaxResumes 30 -DelaySeconds 10
#
# Zatrzymanie: Ctrl+C lub utwórz plik stop-signal.txt z tekstem "STOP"

param(
    [int]$MaxResumes = 20,
    [int]$DelaySeconds = 10,
    [string]$Category = "LOGOWANIE"
)

$ErrorActionPreference = "Continue"
$BasePath = Split-Path -Parent $PSScriptRoot
$TestsDataPath = Join-Path $BasePath "monitor\tests-data.js"
$TestsQueuePath = Join-Path $BasePath "data\tests-queue.json"
$StopSignalPath = Join-Path $BasePath "monitor\stop-signal.txt"
$AgentIdPath = Join-Path $BasePath "data\current-agent-id.txt"
$LogPath = Join-Path $BasePath "data\auto-resume.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path $LogPath -Value $line
}

function Get-TestsData {
    try {
        $content = Get-Content $TestsDataPath -Raw
        if ($content -match 'var testData = (\{[\s\S]*\});?') {
            return $Matches[1] | ConvertFrom-Json
        }
    } catch {}
    return $null
}

function Get-QueueLength {
    try {
        $queue = Get-Content $TestsQueuePath -Raw | ConvertFrom-Json
        return $queue.tests.Count
    } catch {}
    return 0
}

function Test-StopSignal {
    if (Test-Path $StopSignalPath) {
        $content = Get-Content $StopSignalPath -Raw
        return $content -like "*STOP*"
    }
    return $false
}

function Get-AgentId {
    if (Test-Path $AgentIdPath) {
        return (Get-Content $AgentIdPath -Raw).Trim()
    }
    return $null
}

function Save-AgentId {
    param([string]$Id)
    Set-Content -Path $AgentIdPath -Value $Id
}

function Start-TesterAgent {
    param([string]$ResumeId = $null)

    $prompt = if ($ResumeId) {
        "Wznów agenta tester (ID: $ResumeId). Kontynuuj pętlę testową od miejsca gdzie skończył."
    } else {
        "Uruchom agenta tester. Wykonaj testy kategorii $Category."
    }

    Write-Log "Uruchamiam Claude Code..."

    # Run claude with the tester agent
    $output = & claude --print -p "$prompt `@tester" 2>&1 | Out-String

    # Extract agentId from output
    if ($output -match 'agentId: ([a-f0-9]+)') {
        $newId = $Matches[1]
        Save-AgentId $newId
        Write-Log "Agent ID: $newId"
        return $newId
    }

    return $null
}

# Main loop
Write-Log "=" * 60
Write-Log "Auto-Resume Agent Tester - START"
Write-Log "Max wznowien: $MaxResumes, Opoznienie: ${DelaySeconds}s"
Write-Log "Kategoria: $Category"
Write-Log "=" * 60

$resumeCount = 0
$agentId = Get-AgentId

while ($resumeCount -lt $MaxResumes) {
    # Check stop signal
    if (Test-StopSignal) {
        Write-Log "Wykryto STOP signal - koncze"
        break
    }

    # Check progress
    $data = Get-TestsData
    $queueLength = Get-QueueLength
    $completedTests = if ($data.tests) { $data.tests.Count } else { 0 }

    Write-Log "Postep: $completedTests/$queueLength testow"

    # Check if finished
    if ($data.agentStatus.finished -eq $true) {
        Write-Log "Sesja zakonczona przez agenta"
        break
    }

    if ($completedTests -ge $queueLength -and $queueLength -gt 0) {
        Write-Log "Wszystkie testy wykonane!"
        break
    }

    # Run agent
    try {
        $newAgentId = Start-TesterAgent -ResumeId $agentId
        if ($newAgentId) {
            $agentId = $newAgentId
        }
        $resumeCount++
        Write-Log "Wznowienie $resumeCount/$MaxResumes"
    } catch {
        Write-Log "Blad: $_"
        $resumeCount++
    }

    # Delay
    Write-Log "Czekam ${DelaySeconds}s..."
    Start-Sleep -Seconds $DelaySeconds
}

# Final summary
$finalData = Get-TestsData
$summary = $finalData.summary

Write-Log "=" * 60
Write-Log "PODSUMOWANIE"
Write-Log "Wznowien: $resumeCount"
Write-Log "Testow: $($summary.total)"
Write-Log "Passed: $($summary.passed)"
Write-Log "Failed: $($summary.failed)"
Write-Log "Blocked: $($summary.blocked)"
Write-Log "=" * 60
