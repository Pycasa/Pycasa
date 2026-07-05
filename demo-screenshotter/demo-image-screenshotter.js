#!/usr/bin/env node

/**
 * Pycasa Screenshot and Video Generator using Playwright.
 *
 * This script automates Pycasa UI interactions (login, navigation, adding a monitored folder)
 * and records a session video and takes screenshots along the way.
 *
 * Requirements:
 *   npm install playwright
 *
 * Usage:
 *   node demo-image-screenshotter.js
 */

const fs = require('fs');
const path = require('path');

async function run() {
    let playwright;
    try {
        playwright = require('playwright');
    } catch (err) {
        console.error('\x1b[31mError: Playwright is not installed.\x1b[0m');
        console.error('Please run the following command to install dependencies:');
        console.error('  npm install playwright');
        console.error('  npx playwright install chromium');
        process.exit(1);
    }

    const { chromium } = playwright;
    const outputDir = '/Volumes/MacSSD1TB/user-data/amith/Desktop/pycasa-screehshots';

    // Ensure output directory is clean
    if (fs.existsSync(outputDir)) {
        console.log(`Emptying output directory: ${outputDir}`);
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
    console.log(`Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });

    console.log('Launching browser...');
    const browser = await chromium.launch({
        headless: false, // Set to true if you don't want to see the browser window
    });

    console.log('Creating browser context with video recording...');
    const context = await browser.newContext({
        recordVideo: {
            dir: outputDir,
            size: { width: 1440, height: 900 },
        },
        viewport: { width: 1440, height: 900 },
    });

    const page = await context.newPage();

    // Helper to sleep for natural animations/delays
    const delay = (ms = 1000) => new Promise((resolve) => {
        let shouldDelay = true;
        if (shouldDelay) {
            console.log(`Delaying for ${ms}ms...`);
            setTimeout(resolve, ms);
        } else {
            resolve();
        }
    });

    try {
        const appUrl = 'http://localhost:4173';
        await delay();
        console.log(`Navigating to ${appUrl}...`);
        await page.goto(appUrl);

        // Wait for login page
        console.log('Waiting for login fields...');
        await page.waitForSelector('input#username', { timeout: 15000 });
        await delay(); // Let animations settle

        // Screenshot 1: Login Page
        await delay();
        console.log('Saving Login Page screenshot...');
        await page.screenshot({ path: path.join(outputDir, '01_login_page.png') });

        // Simulate typing credentials
        await delay();
        console.log('Typing username...');
        await page.locator('input#username').pressSequentially('admin', { delay: 100 });

        await delay();
        console.log('Typing password...');
        await page.locator('input#password').pressSequentially('admin', { delay: 100 });

        // Click Login
        await delay();
        console.log('Submitting login form...');
        await page.locator('button[type="submit"]').click();

        // Wait for redirect to timeline
        console.log('Waiting for dashboard / timeline view...');
        await page.waitForURL('**/timeline', { timeout: 15000 });
        await page.waitForSelector('aside', { timeout: 10000 });
        await delay(); // Let dashboard load completely

        // Screenshot 2: Dashboard
        await delay();
        console.log('Saving Dashboard screenshot...');
        await page.screenshot({ path: path.join(outputDir, '02_dashboard.png') });

        // Open Profile Menu
        await delay();
        console.log('Opening profile menu...');
        const profileBtn = page.locator('button[aria-label="Profile menu"]');
        await profileBtn.hover();
        await delay();
        await profileBtn.click();
        await delay(); // wait for popover animation

        // Screenshot 3: Profile Dropdown
        await delay();
        console.log('Saving Profile Dropdown screenshot...');
        await page.screenshot({ path: path.join(outputDir, '03_profile_dropdown.png') });

        // Go to Settings
        await delay();
        console.log('Navigating to Settings page...');
        const settingsOption = page.locator('button:has-text("Settings")');
        await settingsOption.click();
        await page.waitForURL('**/settings', { timeout: 10000 });
        await page.waitForSelector('text="Scan Locations"', { timeout: 10000 });
        await delay();

        // Screenshot 4: Settings Page
        await delay();
        console.log('Saving Settings Page screenshot...');
        await page.screenshot({ path: path.join(outputDir, '04_settings_page.png') });

        // Input new folder path manually
        await delay();
        console.log('Adding new folder path...');
        const pathInput = page.locator('input[placeholder="/Volumes/Photos"]');
        const labelInput = page.locator('input[placeholder="My Photos (optional)"]');

        await pathInput.click();
        await delay();
        await pathInput.pressSequentially('/Volumes/MacSSD1TB/user-data/amith/Downloads/exif-samples-master/', { delay: 80 });

        await delay();
        await labelInput.click();
        await delay();
        await labelInput.pressSequentially('Demo Photos', { delay: 80 });

        // Click Add Location
        await delay();
        console.log('Clicking Add Location...');
        const addBtn = page.locator('button:has-text("Add Location")');
        await addBtn.click();
        await delay(2000); // wait for addition & scan status updates

        // Screenshot 5: Folder Added
        await delay();
        console.log('Saving Folder Added screenshot...');
        await page.screenshot({ path: path.join(outputDir, '05_folder_added.png') });

        // Go back to Photos
        await delay();
        console.log('Navigating back to Photos Timeline...');
        const photosBtn = page.locator('aside button:has-text("Photos")');
        await photosBtn.click();
        await page.waitForURL('**/timeline', { timeout: 10000 });
        await delay();

        // Screenshot 6: Photos Page
        await delay();
        console.log('Saving Photos Timeline screenshot...');
        await page.screenshot({ path: path.join(outputDir, '06_photos_page.png') });

        // Scroll activity
        await delay();
        console.log('Scrolling timeline...');
        await page.mouse.move(700, 450);
        for (let i = 0; i < 5; i++) {
            await page.mouse.wheel(0, 250);
            await delay(300);
        }
        await delay();

        // Screenshot 7: Scrolled Page
        console.log('Saving Scrolled Timeline screenshot...');
        await page.screenshot({ path: path.join(outputDir, '07_photos_scrolled.png') });

        // Hover over the first image card
        await delay();
        console.log('Simulating hover on the first image card...');
        const firstCard = page.locator('.group.cursor-pointer').first();
        if (await firstCard.count() > 0) {
            await firstCard.hover();
            await delay(); // Let hover style/animations render
            // Screenshot 8: Hover state
            console.log('Saving image hover screenshot...');
            await page.screenshot({ path: path.join(outputDir, '08_image_hover.png') });
        }

        // Simulate click-drag-scroll on the timeline scrubber
        await delay();
        console.log('Simulating mouse click-drag-scroll on the timeline scrubber...');
        const scrubber = page.locator('.cursor-ns-resize').first();
        if (await scrubber.count() > 0) {
            const box = await scrubber.boundingBox();
            if (box) {
                const startX = box.x + box.width / 2;
                const startY = box.y + 40;
                const endY = box.y + box.height - 40;

                // Move to start of scrubber, press down mouse
                await page.mouse.move(startX, startY);
                await delay(500);
                await page.mouse.down();
                await delay(500);

                // Drag slowly to the end of scrubber
                const steps = 10;
                for (let i = 0; i <= steps; i++) {
                    const currentY = startY + ((endY - startY) * i) / steps;
                    await page.mouse.move(startX, currentY);
                    await delay(150); // slow drag motion for video
                }
                await delay(500);
                await page.mouse.up();
                await delay();

                // Screenshot 9: Drag-scrolled state
                console.log('Saving Drag Scrolled Timeline screenshot...');
                await page.screenshot({ path: path.join(outputDir, '09_drag_scrolled.png') });
            }
        }

        await delay();
        console.log('Demo sequence finished successfully!');
    } catch (err) {
        console.error('An error occurred during automation:', err);
    } finally {
        // Capture video path before closing context
        const video = page.video();
        let videoPath = null;
        if (video) {
            videoPath = await video.path();
        }

        console.log('Closing browser context...');
        await context.close();
        await browser.close();

        // Rename the recorded video to a clean name
        if (videoPath && fs.existsSync(videoPath)) {
            const finalVideoPath = path.join(outputDir, 'demo_recording.webm');
            try {
                fs.renameSync(videoPath, finalVideoPath);
                console.log(`Video recorded and saved to: ${finalVideoPath}`);
            } catch (renameErr) {
                console.error(`Failed to rename video from ${videoPath} to ${finalVideoPath}:`, renameErr);
            }
        }
    }
}

run();
