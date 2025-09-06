# Data Directory

This directory contains all data files that are generated and modified by the application during runtime.

## Structure

```
server/data/
  ├── cache/                        # Cache files
  │   ├── holdings-cache.json       # Holdings price cache
  │   ├── portfolios.json           # Portfolio data persistence
  │   ├── historical-cache.json     # Historical price data cache
  │   ├── icons-cache.json          # Asset icons metadata cache
  │   ├── asset-icon-mapping.json   # Asset symbol to icon mapping
  │   └── file-tracking.json        # File processing tracking
  ├── icons/                        # Asset icon images
  │   ├── aapl.png                  # Individual asset icons
  │   ├── btc.png
  │   ├── template.png              # Default/placeholder icon
  │   └── ... (other asset icons)
  └── README.md                     # This file
```

## Cache Files

### holdings-cache.json
- **Purpose**: Stores cached holding prices and data
- **Format**: JSON with symbol as key and holding data as value
- **Auto-updated**: Yes, when fresh API data is received
- **TTL**: 1 hour (entries expire automatically)
- **Backup**: Automatically backed up on server restart

### portfolios.json
- **Purpose**: Stores portfolio data and calculations
- **Format**: JSON with portfolio information
- **Auto-updated**: Yes, when portfolio is processed
- **Backup**: Automatically backed up on server restart

### historical-cache.json
- **Purpose**: Stores historical price data for chart rendering
- **Format**: JSON with time series data for assets
- **Auto-updated**: Yes, when historical data is fetched
- **TTL**: Varies based on data frequency

### icons-cache.json
- **Purpose**: Caches asset icon metadata and status
- **Format**: JSON with icon information and processing status
- **Auto-updated**: Yes, when icons are fetched or uploaded

### asset-icon-mapping.json
- **Purpose**: Maps asset symbols to their corresponding icon files
- **Format**: JSON mapping of symbol -> filename
- **Auto-updated**: Yes, when new icons are added

### file-tracking.json
- **Purpose**: Tracks file processing operations and status
- **Format**: JSON with file operation metadata
- **Auto-updated**: Yes, during file processing operations

## Icons Directory

### Asset Icons
- **Purpose**: Stores PNG icon files for stocks, crypto, and other assets
- **Format**: PNG images, typically 64x64 or similar dimensions
- **Naming**: Uses asset symbol as filename (e.g., `aapl.png`, `btc.png`)
- **Fallback**: `template.png` serves as placeholder for missing icons
- **Management**: Icons can be uploaded via the web interface

## Important Notes

- **Git Ignored**: This directory is ignored by Git since files change frequently
- **Auto-created**: Directories and files are created automatically if they don't exist
- **Backup**: Files are automatically backed up when the server starts
- **Cleanup**: Expired cache entries are automatically cleaned up every 30 minutes
- **Icon Management**: Icons are managed through dedicated API endpoints and web interface

## Manual Management

### Clear Cache Data
1. Stop the server
2. Delete the cache files: `rm server/data/cache/*.json`
3. Restart the server - cache will be regenerated automatically

### Manage Icons
1. Use the Icons management page in the web interface
2. Upload new icons via drag-and-drop or file selection
3. Icons are automatically processed and mapped to assets
4. Missing icons fall back to `template.png`

## Development

During development, you can monitor these files to see how the system is working:
- Watch `holdings-cache.json` for price updates
- Watch `portfolios.json` for portfolio changes
- Watch `icons-cache.json` for icon processing status
- Watch `asset-icon-mapping.json` for icon assignments
- Use the `/cache` management interface in the web app
- Use the Icons management page for icon debugging 