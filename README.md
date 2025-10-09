# Earnings List

A web application that scrapes and aggregates upcoming US company earnings announcements from Nasdaq and Yahoo Finance, providing an easy-to-use interface for viewing and downloading earnings data.

## 🚀 Features

- **Multi-Source Data Aggregation**: Scrapes earnings calendars from both Nasdaq and Yahoo Finance
- **Interactive Preview**: Browse upcoming earnings announcements in a clean, organized format
- **CSV Export**: Download earnings data as CSV files for further analysis
- **US Companies Focus**: Filtered data for US-listed companies
- **Automated Updates**: Keep track of the latest earnings schedules

## 📋 What It Does

This tool automatically:
1. Fetches earnings announcement schedules from major financial data sources
2. Consolidates and normalizes the data
3. Presents it in an accessible web interface
4. Enables quick export to CSV format for spreadsheet analysis

## 🛠️ Installation

### Prerequisites

- Python 3.7 or higher
- pip (Python package manager)

### Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/iamjohnwatson/earnings-list.git
   cd earnings-list
   ```

2. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## 🚦 Usage

### Running Locally

Start the Flask development server:

```bash
flask --app app run
```

The application will be available at `http://localhost:5000`

### Generating Static Site

To build a static version of the site:

```bash
python build_static.py
```

The static site will be generated in the `docs/` directory with:
- Pre-computed API payloads
- Ready-to-download CSV files
- All necessary assets

## 🌐 Deployment

### GitHub Pages

This repository is configured for automatic deployment to GitHub Pages:

1. Push your changes to the `main` branch
2. The `Deploy static site` workflow automatically builds and deploys
3. Access your site at: `https://<your-username>.github.io/earnings-list/`

To manually trigger a rebuild, go to the **Actions** tab and run the workflow.

## 📊 Data Sources

- **Nasdaq**: Official earnings calendar data
- **Yahoo Finance**: Supplementary earnings information

## 📝 Use Cases

- Track upcoming earnings for investment research
- Plan trading strategies around earnings dates
- Export data for financial modeling
- Monitor earnings season activity

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests

## 📄 License

This project is open source and available under the MIT License.

## ⚠️ Disclaimer

This tool is for informational purposes only. Always verify earnings dates with official company sources. Not intended as financial advice.
