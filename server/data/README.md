# Data Directory

This directory contains all data files that are generated and modified by the application during runtime.

## Structure

```
server/data/
├── cache/                    # Cache files
│   ├── holdings-cache.json   # Holdings price cache
│   └── portfolio-data.json   # Portfolio data cache
└── README.md                # This file
```

## Cache Files

### holdings-cache.json
- **Purpose**: Stores cached holding prices and data
- **Format**: JSON with symbol as key and holding data as value
- **Auto-updated**: Yes, when fresh API data is received
- **TTL**: 1 hour (entries expire automatically)
- **Backup**: Automatically backed up on server restart

### portfolio-data.json
- **Purpose**: Stores portfolio data and calculations
- **Format**: JSON with portfolio information
- **Auto-updated**: Yes, when portfolio is processed
- **Backup**: Automatically backed up on server restart

## Important Notes

- **Git Ignored**: This directory is ignored by Git since files change frequently
- **Auto-created**: Directories and files are created automatically if they don't exist
- **Backup**: Files are automatically backed up when the server starts
- **Cleanup**: Expired cache entries are automatically cleaned up every 30 minutes

## Manual Management

If you need to clear cache data:
1. Stop the server
2. Delete the cache files: `rm server/data/cache/*.json`
3. Restart the server - cache will be regenerated automatically

## Development

During development, you can monitor cache files to see how the system is working:
- Watch `holdings-cache.json` for price updates
- Watch `portfolio-data.json` for portfolio changes
- Use the `/cache` management interface in the web app 