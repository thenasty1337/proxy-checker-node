import axios from 'axios';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import boxen from 'boxen';
import { rainbow, passion } from 'gradient-string';
import figlet from 'figlet';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import os from 'os';

/**
 * @typedef {Object} ProxyConfig
 * @property {number} CONCURRENT_CHECKS - Maximum number of concurrent proxy checks
 * @property {number} TIMEOUT_MS - Timeout in milliseconds for each proxy check
 * @property {number} RETRY_ATTEMPTS - Number of retry attempts for failed checks
 * @property {number} RETRY_DELAY_MS - Delay between retry attempts in milliseconds
 * @property {number} NUM_WORKERS - Number of worker threads to use
 * @property {string[]} TEST_URLS - URLs to test proxies against
 * @property {number} ETA_WINDOW_SIZE - Window size for ETA calculation
 * @property {number} LOG_LINES - Number of log lines to display
 * @property {number} MAX_LOG_HISTORY - Maximum number of log entries to keep
 */

/**
 * @typedef {Object} ProxyDetails
 * @property {string} host - Proxy host IP address
 * @property {number} port - Proxy port number
 * @property {Object} auth - Authentication details
 * @property {string} auth.username - Proxy username
 * @property {string} auth.password - Proxy password
 * @property {string} formatted - Original formatted proxy string
 */

/**
 * @typedef {Object} ProxyCheckResult
 * @property {boolean} working - Whether the proxy is working
 * @property {string} [ip] - IP address returned by the proxy (if working)
 * @property {string} [country] - Country of the proxy (if working)
 * @property {string} [city] - City of the proxy (if working)
 * @property {string} originalProxy - Original proxy string
 * @property {number} [responseTime] - Response time in milliseconds (if working)
 * @property {string} [testedUrl] - URL used for testing (if working)
 * @property {string} [error] - Error message (if not working)
 */

const CONFIG = {
  CONCURRENT_CHECKS: 100,
  TIMEOUT_MS: 10000,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY_MS: 1000,
  NUM_WORKERS: Math.max(os.cpus().length - 1, 1),
  TEST_URLS: [
    'http://ip-api.com/json',
    'https://api.ipify.org?format=json',
    'http://httpbin.org/ip',
  ],
  ETA_WINDOW_SIZE: 100,
  LOG_LINES: 5,
  MAX_LOG_HISTORY: 1000,
};

const PROXY_REGEX = /^([^:]+):([^@]+)@([^:]+):(\d+)$/;

class ConsoleManager {
  /**
   * Creates a new ConsoleManager instance
   * Initializes log buffer and hides cursor
   */
  constructor() {
    this.logBuffer = [];
    this.progressBar = null;
    this.logAreaHeight = CONFIG.LOG_LINES;
    process.stdout.write('\x1B[?25l');
  }

  /**
   * Clears the terminal screen and moves cursor to top
   * Uses ANSI escape codes to perform the clearing
   */
  clearScreen() {
    process.stdout.write('\x1b[2J');
    process.stdout.write('\x1b[0f');
  }

  /**
   * Displays the application title and settings using figlet and gradient
   * @returns {Promise<void>}
   */
  showTitle() {
    this.clearScreen();
    return new Promise((resolve) => {
      figlet.text(
        'PlainProxies.com',
        {
          font: 'Standard',
          horizontalLayout: 'full',
        },
        (err, mainTitle) => {
          if (!err) {
            console.log(rainbow(mainTitle));

            figlet.text(
              'Proxy Checker',
              {
                font: 'Small',
                horizontalLayout: 'full',
              },
              (err2, subtitle) => {
                if (!err2) {
                  console.log(rainbow(subtitle));
                }

                console.log(
                  boxen(
                    chalk.blue(`Workers: ${CONFIG.NUM_WORKERS}\n`) +
                      chalk.yellow(`Timeout: ${CONFIG.TIMEOUT_MS}ms\n`) +
                      chalk.magenta(`Retry Attempts: ${CONFIG.RETRY_ATTEMPTS}`),
                    {
                      padding: 1,
                      margin: {
                        top: 1,
                        right: 1,
                        bottom: 3,
                        left: 1,
                      },
                      borderStyle: 'round',
                      borderColor: 'cyan',
                      title: 'Settings',
                    }
                  )
                );

                console.log('\n\n\n');
                for (let i = 0; i < this.logAreaHeight + 1; i++) {
                  console.log('');
                }

                process.stdout.write(`\x1B[${this.logAreaHeight + 3}A`);

                resolve();
              }
            );
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Creates and initializes the progress bar with custom formatting
   * @returns {SingleBar} The created progress bar instance
   */
  createProgressBar() {
    this.progressBar = new cliProgress.SingleBar(
      {
        format:
          chalk.cyan('{bar}') +
          ' | ' +
          chalk.yellow('{percentage}%') +
          ' | ETA: ' +
          chalk.yellow('{eta}s') +
          ' | Speed: ' +
          chalk.blue('{speed}') +
          ' | ' +
          chalk.green('{working}') +
          '/' +
          chalk.red('{failed}') +
          ' of {total}',
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: false,
        stream: process.stdout,
      },
      cliProgress.Presets.shades_classic
    );

    process.stdout.write('\n');

    return this.progressBar;
  }

  log(message) {
    process.stdout.write('\x1B[s');

    process.stdout.write(`\x1B[${this.logAreaHeight + 1}A`);

    this.logBuffer.push(message + '\n');
    if (this.logBuffer.length > CONFIG.MAX_LOG_HISTORY) {
      this.logBuffer.shift();
    }

    const messages = this.logBuffer.slice(-this.logAreaHeight);

    for (let i = 0; i < this.logAreaHeight; i++) {
      process.stdout.write('\r');
      process.stdout.write('\x1B[2K');
      if (messages[i]) {
        process.stdout.write(messages[i]);
      } else {
        process.stdout.write('\n');
      }
    }

    process.stdout.write('\x1B[u');
  }

  showResults(results, totalTime) {
    if (this.progressBar) {
      this.progressBar.stop();
    }

    process.stdout.write(`\x1B[${this.logAreaHeight + 2}B\n`);

    const workingCount = results.working.length;
    const totalCount = workingCount + results.notWorking.length;
    const successRate = ((workingCount / totalCount) * 100).toFixed(1);

    const avgResponseTime =
      workingCount > 0
        ? Math.round(results.working.reduce((sum, p) => sum + p.responseTime, 0) / workingCount)
        : 0;

    console.log(
      boxen(
        chalk.bold(passion('Final Results\n\n')) +
          chalk.green(`✓ Working Proxies: ${workingCount}\n`) +
          chalk.red(`✗ Failed Proxies: ${results.notWorking.length}\n`) +
          chalk.blue(`Success Rate: ${successRate}%\n`) +
          chalk.yellow(`Total Time: ${totalTime}s\n`) +
          (workingCount > 0 ? chalk.cyan(`Average Response Time: ${avgResponseTime}ms`) : ''),
        {
          padding: 1,
          margin: 2,
          borderStyle: 'double',
          borderColor: 'green',
        }
      )
    );

    console.log(
      boxen(
        chalk.bold('Results saved to:\n\n') +
          chalk.green('✓ working_proxies.json\n') +
          chalk.red('✗ not_working_proxies.json'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'single',
          borderColor: 'yellow',
        }
      )
    );

    process.stdout.write('\x1B[?25h');
  }

  handleError(error) {
    if (this.progressBar) {
      this.progressBar.stop();
    }
    process.stdout.write('\x1B[?25h');
    console.error(
      '\n' +
        boxen(chalk.red('Error: ') + error.message, {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
    );
  }
}
class ETACalculator {
  /**
   * Creates a new ETACalculator instance
   * @param {number} totalItems - Total number of items to process
   */
  constructor(totalItems) {
    this.totalItems = totalItems;
    this.startTime = Date.now();
    this.processedItems = 0;
    this.recentTimes = [];
  }

  /**
   * Updates progress and recalculates ETA
   */
  update() {
    this.processedItems++;
    const currentTime = Date.now();
    this.recentTimes.push(currentTime);

    if (this.recentTimes.length > CONFIG.ETA_WINDOW_SIZE) {
      this.recentTimes.shift();
    }
  }

  /**
   * Gets the current speed of proxy checking in checks per second
   * @returns {string} Formatted speed string (e.g. "10.5 checks/s")
   */
  getETA() {
    if (this.processedItems === 0) return 'Calculating...';

    const timeWindow = this.recentTimes[this.recentTimes.length - 1] - this.recentTimes[0];
    const recentRate = (this.recentTimes.length - 1) / (timeWindow / 1000);
    const remainingItems = this.totalItems - this.processedItems;
    const estimatedSeconds = remainingItems / recentRate;

    if (estimatedSeconds < 0 || !isFinite(estimatedSeconds)) return 'Calculating...';

    if (estimatedSeconds < 60) {
      return `${Math.round(estimatedSeconds)}s`;
    } else if (estimatedSeconds < 3600) {
      const minutes = Math.floor(estimatedSeconds / 60);
      const seconds = Math.round(estimatedSeconds % 60);
      return `${minutes}m ${seconds}s`;
    } else {
      const hours = Math.floor(estimatedSeconds / 3600);
      const minutes = Math.floor((estimatedSeconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Gets the current speed of proxy checking in checks per second
   * @returns {string} Formatted speed string (e.g. "10.5 checks/s")
   */
  getSpeed() {
    if (this.recentTimes.length < 2) return '0 checks/s';
    const timeWindow = this.recentTimes[this.recentTimes.length - 1] - this.recentTimes[0];
    const recentRate = ((this.recentTimes.length - 1) / (timeWindow / 1000)).toFixed(1);
    return `${recentRate} checks/s`;
  }
}

/**
 * Validates if a proxy string matches the required format (user:pass@ip:port)
 * @param {string} proxyString - Proxy string to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidProxyFormat(proxyString) {
  return PROXY_REGEX.test(proxyString);
}

/**
 * Parses a proxy string into its components
 * @param {string} proxyString - Proxy string in format user:pass@ip:port
 * @returns {ProxyDetails} Parsed proxy details
 * @throws {Error} If proxy format is invalid
 */
function parseProxy(proxyString) {
  const match = PROXY_REGEX.exec(proxyString);
  if (!match) throw new Error('Invalid proxy format');

  const [, user, pass, ip, port] = match;
  return {
    host: ip,
    port: parseInt(port),
    auth: { username: user, password: pass },
    formatted: proxyString,
  };
}

/**
 * Creates an axios instance configured with proxy settings
 * @param {string} proxyString - Proxy string to configure
 * @returns {import('axios').AxiosInstance} Configured axios instance
 */
function createAxiosInstance(proxyString) {
  const proxy = parseProxy(proxyString);
  return axios.create({
    proxy: {
      host: proxy.host,
      port: proxy.port,
      auth: {
        username: proxy.auth.username,
        password: proxy.auth.password,
      },
      protocol: 'http',
    },
    timeout: CONFIG.TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 500,
    maxRedirects: 5,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  });
}

/**
 * Tests a proxy against multiple endpoints to verify functionality
 * @param {string} proxyString - Proxy to check
 * @param {number} [attemptNumber=1] - Current attempt number for retries
 * @returns {Promise<ProxyCheckResult>} Result of proxy check
 */
async function checkProxy(proxyString, attemptNumber = 1) {
  if (!isValidProxyFormat(proxyString)) {
    return {
      working: false,
      originalProxy: proxyString,
      error: 'Invalid proxy format',
    };
  }

  const axiosInstance = createAxiosInstance(proxyString);

  for (const testUrl of CONFIG.TEST_URLS) {
    try {
      const startTime = process.hrtime();
      const response = await axiosInstance.get(testUrl);
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const responseTime = Math.round(seconds * 1000 + nanoseconds / 1000000);

      const ipData = response.data;
      const hasValidResponse = ipData && (ipData.query || ipData.ip || ipData.origin);

      if (hasValidResponse) {
        return {
          working: true,
          ip: ipData.query || ipData.ip || ipData.origin,
          country: ipData.country || 'Unknown',
          city: ipData.city || 'Unknown',
          originalProxy: proxyString,
          responseTime,
          testedUrl: testUrl,
        };
      }
    } catch (error) {
      if (attemptNumber < CONFIG.RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
        return checkProxy(proxyString, attemptNumber + 1);
      }
    }
  }

  return {
    working: false,
    originalProxy: proxyString,
    error: `Failed after ${CONFIG.RETRY_ATTEMPTS} attempts`,
  };
}

/**
 * Processes a list of proxies using multiple worker threads
 * @param {string[]} proxies - Array of proxy strings to check
 * @param {ConsoleManager} consoleManager - Console manager instance
 * @param {ETACalculator} etaCalculator - ETA calculator instance
 * @returns {Promise<{working: ProxyCheckResult[], notWorking: ProxyCheckResult[]}>} Results of all proxy checks
 */
function processProxiesWithWorkers(proxies, consoleManager, etaCalculator) {
  const workers = new Array(CONFIG.NUM_WORKERS)
    .fill(null)
    .map(() => new Worker(new URL(import.meta.url).pathname));
  let currentProxyIndex = 0;
  let completedChecks = 0;
  let workingCount = 0;
  let failedCount = 0;
  const results = {
    working: [],
    notWorking: [],
  };

  const progressBar = consoleManager.createProgressBar();
  progressBar.start(proxies.length, 0, {
    working: 0,
    failed: 0,
    total: proxies.length,
    eta: 'Calculating...',
    speed: '0 checks/s',
  });

  return new Promise((resolve) => {
    workers.forEach((worker) => {
      const checkNextProxy = () => {
        if (currentProxyIndex < proxies.length) {
          const proxy = proxies[currentProxyIndex++];
          worker.postMessage(proxy);
        }
      };

      worker.on('message', (result) => {
        completedChecks++;
        etaCalculator.update();

        if (result.working) {
          results.working.push(result);
          workingCount++;
          consoleManager.log(
            chalk.green(`✓ Working: ${result.originalProxy} - ${result.responseTime}ms`)
          );
        } else {
          results.notWorking.push(result);
          failedCount++;
        }

        progressBar.update(completedChecks, {
          working: workingCount,
          failed: failedCount,
          total: proxies.length,
          eta: etaCalculator.getETA(),
          speed: etaCalculator.getSpeed(),
        });

        if (completedChecks === proxies.length) {
          workers.forEach((w) => w.terminate());
          resolve(results);
        } else {
          checkNextProxy();
        }
      });

      checkNextProxy();
    });
  });
}

/**
 * Main application entry point
 * Reads proxies from file, processes them, and saves results
 * @returns {Promise<void>}
 */
async function main() {
  if (isMainThread) {
    const consoleManager = new ConsoleManager();
    try {
      await consoleManager.showTitle();

      const fileStream = await fs.readFile('proxies.txt', 'utf-8');
      const proxies = fileStream
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && isValidProxyFormat(line));

      if (proxies.length === 0) {
        throw new Error('No valid proxies found in proxies.txt');
      }

      const etaCalculator = new ETACalculator(proxies.length);
      const results = await processProxiesWithWorkers(proxies, consoleManager, etaCalculator);

      const totalTime = ((Date.now() - etaCalculator.startTime) / 1000).toFixed(1);
      consoleManager.showResults(results, totalTime);

      await Promise.all([
        fs.writeFile('working_proxies.json', JSON.stringify(results.working, null, 2)),
        fs.writeFile('not_working_proxies.json', JSON.stringify(results.notWorking, null, 2)),
      ]);
    } catch (error) {
      consoleManager.handleError(error);
      throw error;
    }
  }
}

if (!isMainThread) {
  parentPort.on('message', async (proxyString) => {
    try {
      const result = await checkProxy(proxyString);
      parentPort.postMessage(result);
    } catch (error) {
      parentPort.postMessage({
        working: false,
        originalProxy: proxyString,
        error: error.message,
      });
    }
  });
}

process.on('SIGINT', () => {
  process.stdout.write('\x1B[?25h');
  console.log(chalk.yellow('\n\nGracefully shutting down...'));
  throw new Error('Process terminated by user');
});

process.on('unhandledRejection', (error) => {
  process.stdout.write('\x1B[?25h');
  console.error(
    '\n' +
      boxen(chalk.red('Error: ') + error.message, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red',
      })
  );
  throw error;
});

process.on('exit', () => {
  process.stdout.write('\x1B[?25h');
});

if (isMainThread) {
  main();
}
