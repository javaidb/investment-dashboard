const fs = require('fs');
const path = require('path');

class FileTracker {
  constructor() {
    this.trackingFile = path.join(__dirname, 'data', 'cache', 'file-tracking.json');
    this.trackedFiles = new Map();
    this.uploadDirs = [
      path.join(__dirname, 'uploads', 'wealthsimple'),
      path.join(__dirname, 'uploads', 'crypto')
    ];
    this.ensureTrackingDirectory();
    this.loadTracking();
  }

  // Ensure tracking directory exists
  ensureTrackingDirectory() {
    try {
      const trackingDir = path.dirname(this.trackingFile);
      if (!fs.existsSync(trackingDir)) {
        fs.mkdirSync(trackingDir, { recursive: true });
        console.log(`📁 Created file tracking directory: ${trackingDir}`);
      }
    } catch (error) {
      console.warn('⚠️ Could not create file tracking directory:', error.message);
    }
  }

  // Load file tracking data from file
  loadTracking() {
    try {
      if (fs.existsSync(this.trackingFile)) {
        const data = fs.readFileSync(this.trackingFile, 'utf8');
        const trackingData = JSON.parse(data);
        this.trackedFiles = new Map(Object.entries(trackingData));
        console.log(`📋 Loaded tracking data for ${this.trackedFiles.size} files`);
      } else {
        console.log('📋 No file tracking data found, starting fresh');
      }
    } catch (error) {
      console.warn('⚠️ Could not load file tracking data:', error.message);
      this.trackedFiles = new Map();
    }
  }

  // Save file tracking data to file
  saveTracking() {
    try {
      this.ensureTrackingDirectory();
      const trackingData = Object.fromEntries(this.trackedFiles);
      fs.writeFileSync(this.trackingFile, JSON.stringify(trackingData, null, 2));
    } catch (error) {
      console.error('❌ Could not save file tracking data:', error.message);
    }
  }

  // Get all CSV files from upload directories
  getAllCSVFiles() {
    const allFiles = [];
    
    for (const uploadDir of this.uploadDirs) {
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir)
          .filter(file => file.endsWith('.csv'))
          .map(file => ({
            path: path.join(uploadDir, file),
            type: uploadDir.includes('crypto') ? 'crypto' : 'wealthsimple',
            name: file
          }));
        allFiles.push(...files);
      }
    }
    
    return allFiles;
  }

  // Check for new or modified files
  checkForChanges() {
    const currentFiles = this.getAllCSVFiles();
    const changes = {
      newFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
      hasChanges: false
    };

    console.log(`🔍 Checking ${currentFiles.length} files for changes...`);

    // Check for new and modified files
    for (const file of currentFiles) {
      const filePath = file.path;
      const tracked = this.trackedFiles.get(filePath);
      
      try {
        const stats = fs.statSync(filePath);
        const currentMtime = stats.mtime.toISOString();
        const currentSize = stats.size;
        
        if (!tracked) {
          // New file
          changes.newFiles.push({
            ...file,
            mtime: currentMtime,
            size: currentSize
          });
          console.log(`🆕 New file detected: ${file.name}`);
        } else if (tracked.mtime !== currentMtime || tracked.size !== currentSize) {
          // Modified file
          changes.modifiedFiles.push({
            ...file,
            mtime: currentMtime,
            size: currentSize,
            previousMtime: tracked.mtime
          });
          console.log(`📝 Modified file detected: ${file.name}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not check file ${filePath}:`, error.message);
      }
    }

    // Check for deleted files
    const currentFilePaths = new Set(currentFiles.map(f => f.path));
    for (const [trackedPath, trackedData] of this.trackedFiles.entries()) {
      if (!currentFilePaths.has(trackedPath)) {
        changes.deletedFiles.push({
          path: trackedPath,
          name: path.basename(trackedPath),
          ...trackedData
        });
        console.log(`🗑️ Deleted file detected: ${path.basename(trackedPath)}`);
      }
    }

    changes.hasChanges = changes.newFiles.length > 0 || 
                        changes.modifiedFiles.length > 0 || 
                        changes.deletedFiles.length > 0;

    if (changes.hasChanges) {
      console.log(`📊 File changes detected: ${changes.newFiles.length} new, ${changes.modifiedFiles.length} modified, ${changes.deletedFiles.length} deleted`);
    } else {
      console.log('✅ No file changes detected');
    }

    return changes;
  }

  // Update tracking for all current files
  updateTracking() {
    const currentFiles = this.getAllCSVFiles();
    const newTracking = new Map();
    
    console.log(`📋 Updating tracking for ${currentFiles.length} files...`);
    
    for (const file of currentFiles) {
      try {
        const stats = fs.statSync(file.path);
        newTracking.set(file.path, {
          name: file.name,
          type: file.type,
          mtime: stats.mtime.toISOString(),
          size: stats.size,
          lastTracked: new Date().toISOString()
        });
      } catch (error) {
        console.warn(`⚠️ Could not track file ${file.path}:`, error.message);
      }
    }
    
    this.trackedFiles = newTracking;
    this.saveTracking();
    console.log(`💾 Updated tracking for ${this.trackedFiles.size} files`);
  }

  // Mark files as processed (called after successful portfolio processing)
  markAsProcessed(portfolioId) {
    const timestamp = new Date().toISOString();
    
    for (const [filePath, fileData] of this.trackedFiles.entries()) {
      this.trackedFiles.set(filePath, {
        ...fileData,
        lastProcessed: timestamp,
        lastPortfolioId: portfolioId
      });
    }
    
    this.saveTracking();
    console.log(`✅ Marked ${this.trackedFiles.size} files as processed for portfolio ${portfolioId}`);
  }

  // Get files that haven't been processed yet
  getUnprocessedFiles() {
    const allFiles = this.getAllCSVFiles();
    const unprocessed = [];
    
    for (const file of allFiles) {
      const tracked = this.trackedFiles.get(file.path);
      if (!tracked || !tracked.lastProcessed) {
        unprocessed.push(file);
      }
    }
    
    return unprocessed;
  }

  // Get tracking statistics
  getStats() {
    const allFiles = this.getAllCSVFiles();
    const processed = Array.from(this.trackedFiles.values()).filter(f => f.lastProcessed);
    
    return {
      totalFiles: allFiles.length,
      trackedFiles: this.trackedFiles.size,
      processedFiles: processed.length,
      unprocessedFiles: allFiles.length - processed.length,
      trackingFile: this.trackingFile,
      lastUpdate: processed.length > 0 ? Math.max(...processed.map(f => new Date(f.lastProcessed).getTime())) : null
    };
  }

  // Clear all tracking data
  clearTracking() {
    const count = this.trackedFiles.size;
    this.trackedFiles.clear();
    this.saveTracking();
    console.log(`🧹 Cleared tracking for ${count} files`);
    return count;
  }
}

// Create singleton instance
const fileTracker = new FileTracker();

module.exports = fileTracker;