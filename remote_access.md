# Agent Access & Installation Guide

This guide explains how to share the **Shopify E-commerce CRM** with your agents and how they can install it as a standalone app on their computers.

---

## 1. Sharing the CRM with Agents

Depending on where your agents are, use one of the following methods:

### Method A: Agents on the Same WiFi/Network
This is the fastest method. No extra software is needed.

1.  **Find your Local IP**:
    -   Open PowerShell/Terminal on your computer and type: `ipconfig`
    -   Look for `IPv4 Address` (e.g., `192.168.1.100`).
2.  **Share the URL**: Tell your agents to browse to:
    -   `http://YOUR_IP:3000` (Replace `YOUR_IP` with your actual IP address).

### Method B: Remote Agents (Different Network)
Use this if you are not at home/office or your agents are working remotely.

1.  **Tailscale Funnel**: (Recommended)
    -   Since you are already using Tailscale, you can use the **Funnel** feature to expose your local CRM to the internet securely.
2.  **Current URL**: Your CRM is accessible at:
    -   `https://cureforeverpc.tail1b3337.ts.net`
3.  **Share the URL**: Simply send the above link to your agents. They can log in and even "Install" the app as a PWA from this URL.

---

## 2. How to Install the App (on Agent's Computer)

Once the agent has opened the URL in their browser (Chrome or Edge recommended):

1.  **Look for the Install Icon**:
    -   In the address bar (top right), they will see a small icon that looks like a **monitor with a down arrow**.
    -   Alternatively, they can click the **three dots (...)** menu and select **"Install Shopify E-commerce CRM"**.
2.  **Click Install**: The CRM will now open in a standalone, premium window without browser tabs.
3.  **Desktop Shortcut**: A shortcut will automatically be added to their Desktop and Start Menu.

---

> [!TIP]
> The app is now a PWA (Progressive Web App). It feels like a native desktop application and uses the custom Shopify-themed icon we created!
