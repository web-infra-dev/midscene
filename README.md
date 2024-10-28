<p align="center">
  <img alt="Midscene.js" width="260" src="https://github.com/user-attachments/assets/bff5e76f-ea5c-42b7-bd12-0143a04671cf">
</p>

<h1 align="center">Midscene.js</h1>

<div align="center">
  <p>English | [简体中文](./README.zh.md) | [日本語](./README.ja.md)</p>
</div>

<p align="center">Joyful UI Automation</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@midscene/web?style=flat-square&color=00a8f0" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/@midscene/web.svg?style=flat-square&color=00a8f0" alt="downloads" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
</p>

---

## Overview 📚

**Midscene.js** is a cutting-edge AI-powered SDK for UI automation that simplifies interaction with web pages. It’s designed for developers who want to automate page interactions, perform assertions, and extract data in JSON format through natural language commands. Experience a truly seamless approach to automation with powerful integrations and intuitive feedback.

<p align="center">
  <video src="https://github.com/user-attachments/assets/995486bf-0905-43a0-ae33-234b1307dcf1" controls />
</p>

## Key Features ✨

- **Natural Language Interaction 👆**  
  Describe your actions in plain language, and let Midscene.js handle the execution. It plans, interprets, and interacts with the UI to perform your tasks.

- **Data Extraction in JSON 🔍**  
  Get structured data without hassle! Just specify your data format preferences, and Midscene.js will respond in JSON.

- **Intuitive Assertions 🤔**  
  Make assertions with ease. No complex scripting—just express your expectations in natural language, and Midscene.js will validate them.

- **Ready-to-Use LLMs 🪓**  
  Leverage existing multimodal LLMs (like GPT-4) out-of-the-box, with no need for additional training.

- **Visualized Reporting 🎞️**  
  Debugging is a breeze with visualized reports, providing a clear view of every step taken in the automation process.

- **Exciting New Automation Experience! 🔥**  
  Step into a new world of automation development with streamlined interactions and real-time UI control.

---

## Installation 📥

Install Midscene.js via npm:

```bash
npm install @midscene/web
```

Or via yarn:

```bash
yarn add @midscene/web
```

## Quick Start 🚀

1. **Import the SDK**  
   Start by importing Midscene.js in your JavaScript file:
   
   ```javascript
   import midscene from '@midscene/web';
   ```

2. **Initialize the SDK**  
   Initialize the Midscene.js instance to set up your automation environment:

   ```javascript
   const automation = new midscene();
   ```

3. **Define Your Steps**  
   Describe the tasks using natural language, and let Midscene.js handle the rest:
   
   ```javascript
   automation.perform("Click on the 'Sign In' button and log in.");
   ```

4. **Extract Data in JSON**  
   Use the SDK to extract data in structured JSON format:
   
   ```javascript
   automation.extract("Get all product names and prices in JSON format.");
   ```

5. **Run and View Report**  
   Once your script executes, access the visualized report to analyze your automation run.

For a more detailed walkthrough, check out our [Quick Start Guide](https://midscenejs.com/docs/getting-started/quick-start.html).

---

## Resources 📄

- **[Home Page](https://midscenejs.com/)**  
  Explore Midscene.js features and documentation in-depth.
  
- **[Quick Start Guide](https://midscenejs.com/docs/getting-started/quick-start.html)**  
  Follow a step-by-step guide to set up and run your first automation.

- **[API Reference](https://midscenejs.com/docs/usage/API.html)**  
  Detailed documentation of available API methods and options.

---

## License 📝

Midscene.js is open-source and licensed under the [MIT License](https://github.com/web-infra-dev/midscene/blob/main/LICENSE). Enjoy the freedom to modify, distribute, and build upon it.

