import puppeteer from 'puppeteer';
import fs from 'fs';

const captureScreenshots = async () => {
    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Set viewport to a good desktop size
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating to http://localhost:5180...');
    try {
        await page.goto('http://localhost:5180', { waitUntil: 'networkidle0', timeout: 30000 });
    } catch (e) {
        console.log('Failed to load page. Is the dev server running?', e);
        await browser.close();
        return;
    }

    // Hide the tray mode/notifications if any, or wait a bit
    await new Promise(r => setTimeout(r, 2000));

    const views = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'chat', label: 'Chat' },
        { id: 'activity', label: 'Activity' },
        { id: 'code', label: 'Code' },
        { id: 'brain', label: 'Brain' },
        { id: 'schedule', label: 'Schedule' },
        { id: 'zen', label: 'Zen Mode' },
        { id: 'music', label: 'Music' }
    ];

    const screenshots = [];

    for (const view of views) {
        console.log(`Switching to ${view.label}...`);
        // Find the button with the corresponding aria-label and click it
        try {
            await page.waitForSelector(`button[aria-label="${view.label}"]`, { timeout: 5000 });
            await page.click(`button[aria-label="${view.label}"]`);

            // Wait for animation/transition to settle
            await new Promise(r => setTimeout(r, 1500));

            const path = `screenshot_${view.id}.png`;
            await page.screenshot({ path });
            screenshots.push({ id: view.id, label: view.label, path });
            console.log(`Saved ${path}`);
        } catch (e) {
            console.log(`Could not capture ${view.label}:`, e.message);
        }
    }

    await browser.close();
    return screenshots;
};

const generatePDF = async (screenshots) => {
    console.log('Generating HTML for PDF...');

    let html = `
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 40px; }
          h1 { color: #111; font-size: 36px; border-bottom: 2px solid #eaeaea; padding-bottom: 10px; }
          h2 { color: #222; font-size: 28px; margin-top: 40px; }
          p { font-size: 16px; margin-bottom: 20px; }
          .screenshot { width: 100%; max-width: 1000px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px 0 40px 0; }
          .page-break { page-break-before: always; }
          .feature-card { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h1>Allentire (Gemini-Cortex)</h1>
        <p><strong>Version:</strong> 1.0.0</p>
        <p><strong>Description:</strong> Allentire is a powerful, local-first, privacy-focused AI desktop application. Built with Tauri v2, React, Vite, and Zustand, it provides a highly modular and responsive workspace integrating multiple AI models (such as NVIDIA NIM and A4F).</p>
        
        <h2>Architectural Approach</h2>
        <div class="feature-card">
          <p><strong>Frontend:</strong> The UI is constructed using React 19, styled with Tailwind CSS, and seamlessly animated with Framer Motion. It acts as a single-page application heavily relying on global state management via Zustand.</p>
          <p><strong>Backend/System:</strong> Operating as a Tauri v2 desktop application, Allentire gains deep integration with the host operating system, ensuring high performance and allowing local-first data privacy.</p>
          <p><strong>Modular Workspace:</strong> The application is divided into distinct "views" (Dashboard, Chat, Code, Brain, Schedule, etc.), each serving a specialized purpose for developers and power users, connected by a global navigation store.</p>
        </div>

        <div class="page-break"></div>
        <h2>Application Interfaces</h2>
  `;

    for (const shot of screenshots) {
        let description = '';
        switch (shot.id) {
            case 'dashboard': description = 'The central command center providing an overview of recent activity, active timers, and quick access to tools.'; break;
            case 'chat': description = 'A robust AI chat interface with markdown support, model selection, and context-aware conversations.'; break;
            case 'activity': description = 'Tracks application usage, AI interactions, and user activity, helping to maintain an audit trail of tasks.'; break;
            case 'code': description = 'A dedicated coding assistant interface designed for code generation, review, and repository analysis.'; break;
            case 'brain': description = 'A knowledge management system capable of connecting concepts and managing long-term agent memory.'; break;
            case 'schedule': description = 'Integrates with Google Calendar and Tasks to manage events, meetings, and upcoming deadlines seamlessly.'; break;
            case 'zen': description = 'A distraction-free environment optimized for deep work, focusing solely on the task at hand.'; break;
            case 'music': description = 'An integrated music player utilizing a connection to ambient playlists or local files to enhance focus.'; break;
        }

        html += `
        <h3>${shot.label}</h3>
        <p>${description}</p>
        <img class="screenshot" src="file://${process.cwd()}/${shot.path}" />
    `;
    }

    html += `
      </body>
    </html>
  `;

    fs.writeFileSync('temp_pdf.html', html);

    console.log('Launching Puppeteer to print PDF...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const filePath = `file://${process.cwd()}/temp_pdf.html`;
    await page.goto(filePath, { waitUntil: 'networkidle0' });

    const pdfPath = 'Allentire_App_Overview.pdf';
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });

    await browser.close();
    console.log(`PDF generated successfully at ${pdfPath}!`);
};

const main = async () => {
    const screenshots = await captureScreenshots();
    if (screenshots && screenshots.length > 0) {
        await generatePDF(screenshots);
    } else {
        console.log('No screenshots captured. Aborting PDF generation.');
    }
};

main();
