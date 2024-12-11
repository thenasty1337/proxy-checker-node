# Proxy Checker

A high-performance proxy checker with multi-threading support and a beautiful CLI interface. Built with Node.js for maximum efficiency and reliability.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

## Features

- ⚡ Multi-threaded proxy checking for maximum performance
- 🎨 Beautiful CLI interface with real-time progress tracking
- 📊 Detailed statistics and results
- 🔄 Automatic retry mechanism for failed checks
- 💾 JSON output for working and non-working proxies
- ⏱️ Response time measurement
- 🌍 IP geolocation information
- 🚀 Support for HTTP/HTTPS proxies

## Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0

## Installation

```bash
# Clone the repository
git clone https://github.com/nasty1337/proxy-checker-node.git

# Navigate to the project directory
cd proxy-checker-node

# Install dependencies
npm install
```

## Usage

1. Create a `proxies.txt` file in the project root with your proxies in the format:
```
username:password@host:port
```

2. Run the proxy checker:
```bash
npm start
```

The tool will:
- Check all proxies concurrently
- Display real-time progress
- Show statistics about working/non-working proxies
- Save results to JSON files

## Output Files

- `working_proxies.json`: Contains all working proxies with response times and location data
- `not_working_proxies.json`: Contains failed proxies with error messages

## Configuration

Edit the `CONFIG` object in `main.js` to customize:

```javascript
const CONFIG = {
    CONCURRENT_CHECKS: 100,    // Number of concurrent checks
    TIMEOUT_MS: 10000,        // Timeout for each check
    RETRY_ATTEMPTS: 2,        // Number of retry attempts
    RETRY_DELAY_MS: 1000,     // Delay between retries
    // ... other options
};
```

## Development

```bash
# Run ESLint
npm run lint

# Format code
npm run format

# Run lint and tests together
npm run check
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**nasty1337**
- Website: [plainproxies.com](https://plainproxies.com)
- GitHub: [@nasty1337](https://github.com/nasty1337)
- Email: thenasty1337@protonmail.com

## Acknowledgments

- [axios](https://github.com/axios/axios) for HTTP requests
- [chalk](https://github.com/chalk/chalk) for terminal styling
- [cli-progress](https://github.com/npkgz/cli-progress) for progress bars
- [figlet](https://github.com/patorjk/figlet.js) for ASCII art
- [gradient-string](https://github.com/bokub/gradient-string) for gradient effects

---

Made with ❤️ by [plainproxies.com](https://plainproxies.com)
