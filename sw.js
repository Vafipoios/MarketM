let config = { geminiKey: '', marketKey: '', tickers: [] };
let loopInterval = null;

// Listen for updates from the frontend dashboard UI
self.addEventListener('message', (event) => {
    if (event.data.type === 'SYNC_CONFIG') {
        config.geminiKey = event.data.geminiKey;
        config.marketKey = event.data.marketKey;
        config.tickers = event.data.tickers;
    }

    if (event.data.type === 'START_LOOP') {
        if (loopInterval) clearInterval(loopInterval);
        runAIPipeline();
        // Check markets and process through AI every 5 minutes
        loopInterval = setInterval(runAIPipeline, 5 * 60 * 1000);
    }

    if (event.data.type === 'STOP_LOOP') {
        clearInterval(loopInterval);
        loopInterval = null;
    }
});

async function runAIPipeline() {
    if (!config.geminiKey || !config.marketKey || config.tickers.length === 0) return;

    try {
        // 1. Core Data Retrieval Sequence
        const symbols = config.tickers.join(',');
        const res = await fetch(`https://api.twelvedata.com/price?symbol=${symbols}&apikey=${config.marketKey}`);
        const data = await res.json();
        
        let contextBlock = "";
        config.tickers.forEach(t => {
            const tickerData = data[t] || data;
            const price = tickerData.price ? parseFloat(tickerData.price).toFixed(2) : "N/A";
            contextBlock += `Ticker: \${t} | Spot Price: $\${price}\n`;
        });

        // 2. Transmit Parameters to Gemini API Endpoint
        const prompt = `Review market values. If major movements or extreme spikes occur, write an analytical 1-sentence warning. If normal, return 'NONE'.\nData:\n\${contextBlock}`;
        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${config.geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiRes.json();
        const decision = aiData.candidates[0].content.parts[0].text.trim();

        // 3. Drop Native System Banners if Flagged by AI Engine
        if (!decision.toUpperCase().includes("NONE")) {
            self.registration.showNotification("📈 Market AI Alert", {
                body: decision,
                icon: "https://cdn-icons-png.flaticon.com/512/4256/4256900.png",
                vibrate: [200, 100, 200]
            });
        }
    } catch (err) {
        console.error("Worker pipeline error: ", err);
    }
}