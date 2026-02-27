/**
 * Auto-Resume Agent Tester
 *
 * Automatycznie wznawia agenta gdy zatrzyma się przed ukończeniem wszystkich testów.
 *
 * Użycie:
 *   node auto-resume.js [--max-resumes=10] [--delay=5]
 *
 * Opcje:
 *   --max-resumes=N   Maksymalna liczba wznowień (domyślnie: 20)
 *   --delay=N         Opóźnienie między wznowieniami w sekundach (domyślnie: 5)
 *   --agent-id=ID     ID agenta do wznowienia (opcjonalne, pobiera z ostatniej sesji)
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PATHS = {
    testsData: path.join(__dirname, '..', 'monitor', 'tests-data.js'),
    testsQueue: path.join(__dirname, '..', 'data', 'tests-queue.json'),
    stopSignal: path.join(__dirname, '..', 'monitor', 'stop-signal.txt'),
    agentIdFile: path.join(__dirname, '..', 'data', 'current-agent-id.txt'),
    logFile: path.join(__dirname, '..', 'data', 'auto-resume.log')
};

// Parse arguments
const args = process.argv.slice(2);
const params = {
    maxResumes: 20,
    delay: 5,
    agentId: null
};

args.forEach(arg => {
    if (arg.startsWith('--max-resumes=')) params.maxResumes = parseInt(arg.split('=')[1]);
    if (arg.startsWith('--delay=')) params.delay = parseInt(arg.split('=')[1]);
    if (arg.startsWith('--agent-id=')) params.agentId = arg.split('=')[1];
});

function log(msg) {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    fs.appendFileSync(PATHS.logFile, line + '\n');
}

function getTestsData() {
    try {
        const content = fs.readFileSync(PATHS.testsData, 'utf8');
        // Extract JSON from "var testData = {...};"
        const match = content.match(/var testData = (\{[\s\S]*\});?/);
        if (match) {
            return JSON.parse(match[1]);
        }
    } catch (e) {
        log(`Błąd odczytu tests-data.js: ${e.message}`);
    }
    return null;
}

function getQueueLength() {
    try {
        const content = fs.readFileSync(PATHS.testsQueue, 'utf8');
        const queue = JSON.parse(content);
        return queue.tests?.length || queue.totalTests || 0;
    } catch (e) {
        log(`Błąd odczytu tests-queue.json: ${e.message}`);
        return 0;
    }
}

function hasStopSignal() {
    try {
        if (fs.existsSync(PATHS.stopSignal)) {
            const content = fs.readFileSync(PATHS.stopSignal, 'utf8');
            return content.includes('STOP');
        }
    } catch (e) {}
    return false;
}

function getAgentId() {
    if (params.agentId) return params.agentId;
    try {
        if (fs.existsSync(PATHS.agentIdFile)) {
            return fs.readFileSync(PATHS.agentIdFile, 'utf8').trim();
        }
    } catch (e) {}
    return null;
}

function saveAgentId(id) {
    fs.writeFileSync(PATHS.agentIdFile, id);
}

function runAgent(resumeId = null) {
    return new Promise((resolve, reject) => {
        const prompt = resumeId
            ? `KONTYNUUJ testy. Wykonuj pętlę: I++, GOTO LOOP. NIE zatrzymuj się.`
            : `Wykonaj testy zgodnie z AGENT.md. Kategoria: LOGOWANIE.`;

        const args = ['--print', '-p', prompt];

        if (resumeId) {
            // Resume uses conversation continuation
            args.push('--resume', resumeId);
        }

        args.push('@tester');

        log(`Uruchamiam agenta${resumeId ? ` (resume: ${resumeId})` : ''}...`);

        const proc = spawn('claude', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        let output = '';
        let agentId = null;

        proc.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;

            // Extract agentId from output
            const match = text.match(/agentId: ([a-f0-9]+)/);
            if (match) {
                agentId = match[1];
                saveAgentId(agentId);
            }
        });

        proc.stderr.on('data', (data) => {
            // Ignore stderr or log if needed
        });

        proc.on('close', (code) => {
            log(`Agent zakończył z kodem: ${code}`);
            resolve({ code, output, agentId });
        });

        proc.on('error', (err) => {
            log(`Błąd uruchomienia agenta: ${err.message}`);
            reject(err);
        });
    });
}

async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function main() {
    log('='.repeat(60));
    log('Auto-Resume Agent Tester - START');
    log(`Max wznowień: ${params.maxResumes}, Opóźnienie: ${params.delay}s`);
    log('='.repeat(60));

    let resumeCount = 0;
    let currentAgentId = getAgentId();

    while (resumeCount < params.maxResumes) {
        // Check stop signal
        if (hasStopSignal()) {
            log('Wykryto STOP signal - kończę');
            break;
        }

        // Check progress
        const data = getTestsData();
        const queueLength = getQueueLength();
        const completedTests = data?.tests?.length || 0;

        log(`Postęp: ${completedTests}/${queueLength} testów`);

        // Check if finished
        if (data?.agentStatus?.finished === true) {
            log('Agent oznaczył sesję jako zakończoną');
            break;
        }

        if (completedTests >= queueLength && queueLength > 0) {
            log('Wszystkie testy wykonane!');
            break;
        }

        // Run or resume agent
        try {
            const result = await runAgent(currentAgentId);

            if (result.agentId) {
                currentAgentId = result.agentId;
                log(`Nowy agentId: ${currentAgentId}`);
            }

            resumeCount++;
            log(`Wznowienie ${resumeCount}/${params.maxResumes}`);

        } catch (err) {
            log(`Błąd: ${err.message}`);
            resumeCount++;
        }

        // Delay before next resume
        log(`Czekam ${params.delay}s przed następnym wznowieniem...`);
        await sleep(params.delay);
    }

    // Final status
    const finalData = getTestsData();
    const summary = finalData?.summary || {};

    log('='.repeat(60));
    log('PODSUMOWANIE');
    log(`Wznowień: ${resumeCount}`);
    log(`Testów: ${summary.total || 0}`);
    log(`Passed: ${summary.passed || 0}`);
    log(`Failed: ${summary.failed || 0}`);
    log(`Blocked: ${summary.blocked || 0}`);
    log('='.repeat(60));
}

main().catch(err => {
    log(`FATAL: ${err.message}`);
    process.exit(1);
});
