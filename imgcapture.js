/**
 * CAPTCHA Image Farmer
 * 
 * Uses the EXACT same code path as deckathonRegister.js, but runs in "farm mode"
 * which saves new unique faces from the CAPTCHA instead of solving it.
 */

const { registerOnDeckathon } = require('./deckathonRegister');
const fs = require('fs');
const path = require('path');

const TOTAL_RUNS = 5;
const FACES_DIR = path.join(__dirname, 'captcha_faces');

async function main() {
    console.log('='.repeat(60));
    console.log('CAPTCHA IMAGE FARMER');
    console.log(`Running ${TOTAL_RUNS} instances in FARM MODE`);
    console.log('='.repeat(60));

    // Ensure faces directory exists
    if (!fs.existsSync(FACES_DIR)) {
        fs.mkdirSync(FACES_DIR, { recursive: true });
    }

    const initialCount = fs.readdirSync(FACES_DIR).filter(f => f.endsWith('.png')).length;
    console.log(`Starting with ${initialCount} saved faces\n`);

    for (let i = 1; i <= TOTAL_RUNS; i++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`FARM RUN ${i}/${TOTAL_RUNS}`);
        console.log('='.repeat(60));

        try {
            await registerOnDeckathon({ runId: i, farmMode: true });
        } catch (err) {
            console.log(`Run ${i} error: ${err.message}`);
        }

        // Brief pause between runs
        if (i < TOTAL_RUNS) {
            console.log('\nWaiting 3 seconds before next run...');
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    // Summary
    const finalCount = fs.readdirSync(FACES_DIR).filter(f => f.endsWith('.png')).length;
    const newFaces = finalCount - initialCount;

    console.log('\n' + '='.repeat(60));
    console.log('FARMING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total runs: ${TOTAL_RUNS}`);
    console.log(`New faces captured: ${newFaces}`);
    console.log(`Total faces in collection: ${finalCount}`);
    console.log(`Saved to: ${FACES_DIR}`);
}

main().catch(console.error);
