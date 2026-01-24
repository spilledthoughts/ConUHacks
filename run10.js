/**
 * Run 10 instances of Deckathon Registration SEQUENTIALLY
 * One at a time to avoid race conditions
 * Reports success rate at the end
 */

const { registerOnDeckathon } = require('./deckathonRegister');
const fs = require('fs');
const path = require('path');

const TOTAL_RUNS = 10;

async function main() {
    console.log('='.repeat(60));
    console.log('DECKATHON REGISTRATION - 10 SEQUENTIAL RUNS');
    console.log('='.repeat(60));
    console.log(`Started at: ${new Date().toISOString()}\n`);

    const allResults = [];

    for (let runId = 1; runId <= TOTAL_RUNS; runId++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`STARTING RUN ${runId}/${TOTAL_RUNS}`);
        console.log('='.repeat(60));

        try {
            const result = await registerOnDeckathon({ runId });
            allResults.push({
                runId,
                ...result
            });
        } catch (err) {
            allResults.push({
                runId,
                success: false,
                username: null,
                error: err.message
            });
        }

        const lastResult = allResults[allResults.length - 1];
        console.log(`\nRun ${runId} complete: ${lastResult.success ? '✅' : '❌'} ${lastResult.username || 'N/A'}`);

        // Short pause between runs
        if (runId < TOTAL_RUNS) {
            console.log('Waiting 3 seconds before next run...');
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    // Final Summary
    const successCount = allResults.filter(r => r.success).length;
    const failCount = allResults.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Runs: ${TOTAL_RUNS}`);
    console.log(`Successes: ${successCount} ✅`);
    console.log(`Failures: ${failCount} ❌`);
    console.log(`Success Rate: ${((successCount / TOTAL_RUNS) * 100).toFixed(1)}%`);
    console.log('\nDetailed Results:');
    allResults.forEach(r => {
        console.log(`  Run ${r.runId}: ${r.success ? '✅' : '❌'} ${r.username || 'N/A'} ${r.error ? `(${r.error})` : ''}`);
    });

    // Save results to file
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const resultsPath = path.join(dataDir, 'run10_results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalRuns: TOTAL_RUNS,
        successCount,
        failCount,
        successRate: `${((successCount / TOTAL_RUNS) * 100).toFixed(1)}%`,
        results: allResults
    }, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);
    console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch(console.error);
