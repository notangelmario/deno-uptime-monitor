import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

interface Monitor {
  url: string;
  webhookUrl: string;
}

const env = await load();

const NUMBER_OF_MONITORS = env["NUMBER_OF_MONITORS"];

// Crontab 1m
const interval = "*/1 * * * *"
const monitors = Array(parseInt(NUMBER_OF_MONITORS)).fill(null).map((_, index) => {
  return {
    url: env[`URL${index}`],
    webhookUrl: env[`WEBHOOK_URL${index}`]
  }
})

console.log("Monitors", monitors);

// This function is called 5 times before giving up and rejecting
const tryAgain = async (url: string) => {
  let tries: number = 0;

  while (tries < 5) {
    tries++;
    const response = await fetch(url).catch(() => ({ status: 500 }));
    if (response.status === 200) {
      return response;
    }

    console.error(`Monitor ${url} is still down! Retrying...`);
    
    // Wait 5 seconds before retrying
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return { status: 500 };
}

Deno.cron("uptime-monitor", interval, () => {
  // Process all monitors async
  const promises = monitors.map(async (monitor: Monitor) => {
    const response = await fetch(monitor.url).catch(() => ({ status: 500 }));
    let status = response.status;

    console.log(`Monitor ${monitor.url} status: ${status}`);

    // Retry 5 times before giving up
    // This is to avoid false positives
    if (status !== 200) {
      console.error(`Monitor ${monitor.url} is down! Starting retries...`);

      const retryResponse = await tryAgain(monitor.url);
      
      if (retryResponse.status !== 200) {
        console.error(`Monitor ${monitor.url} is still down after retries!`);
        status = retryResponse.status;
      } else {
        console.log(`Monitor ${monitor.url} is back up!`);
        status = 200;
      }
    }

    await fetch(monitor.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trigger: status === 200 ? "up" : "down",
      })
    }).catch(() => {
      console.error(`Failed to send webhook to ${monitor.webhookUrl}`);
    });
  })
  
  Promise.allSettled(promises);
})