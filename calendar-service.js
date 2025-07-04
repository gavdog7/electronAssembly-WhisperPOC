const https = require('https');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class CalendarService extends EventEmitter {
  constructor() {
    super();
    this.calendarUrl = 'https://calendar.google.com/calendar/ical/gavin.edgley%40databricks.com/public/basic.ics';
    this.calendarDataPath = path.join(__dirname, 'calendar-data');
    this.calendarFile = path.join(this.calendarDataPath, 'work-calendar.ics');
    this.downloadInterval = null;
    
    // Ensure calendar data directory exists
    this.ensureDirectoryExists();
  }

  ensureDirectoryExists() {
    if (!fs.existsSync(this.calendarDataPath)) {
      fs.mkdirSync(this.calendarDataPath, { recursive: true });
      console.log('Created calendar data directory:', this.calendarDataPath);
    }
  }

  async downloadICS() {
    return new Promise((resolve, reject) => {
      console.log('Downloading calendar data from:', this.calendarUrl);
      
      https.get(this.calendarUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const writeStream = fs.createWriteStream(this.calendarFile);
        
        writeStream.on('error', (error) => {
          console.error('Error writing calendar file:', error);
          reject(error);
        });

        writeStream.on('finish', () => {
          console.log('Calendar data downloaded successfully');
          this.emit('calendarUpdated', this.calendarFile);
          resolve(this.calendarFile);
        });

        response.pipe(writeStream);
      }).on('error', (error) => {
        console.error('Error downloading calendar:', error);
        reject(error);
      });
    });
  }

  parseICS(icsContent) {
    const events = [];
    const lines = icsContent.split('\n').map(line => line.trim());
    
    let currentEvent = null;
    let inEvent = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {
          raw: [],
          summary: '',
          dtstart: '',
          dtend: '',
          description: '',
          location: '',
          uid: '',
          created: '',
          lastModified: '',
          sequence: '',
          status: '',
          organizer: '',
          attendees: []
        };
      } else if (line === 'END:VEVENT' && inEvent) {
        inEvent = false;
        if (currentEvent) {
          // Add raw ICS data for this event
          currentEvent.raw = currentEvent.raw.join('\n');
          events.push(currentEvent);
        }
        currentEvent = null;
      } else if (inEvent && currentEvent) {
        // Store raw line
        currentEvent.raw.push(line);
        
        // Parse specific fields
        if (line.startsWith('SUMMARY:')) {
          currentEvent.summary = line.substring(8);
        } else if (line.startsWith('DTSTART')) {
          currentEvent.dtstart = line;
        } else if (line.startsWith('DTEND')) {
          currentEvent.dtend = line;
        } else if (line.startsWith('DESCRIPTION:')) {
          currentEvent.description = line.substring(12);
        } else if (line.startsWith('LOCATION:')) {
          currentEvent.location = line.substring(9);
        } else if (line.startsWith('UID:')) {
          currentEvent.uid = line.substring(4);
        } else if (line.startsWith('CREATED:')) {
          currentEvent.created = line.substring(8);
        } else if (line.startsWith('LAST-MODIFIED:')) {
          currentEvent.lastModified = line.substring(14);
        } else if (line.startsWith('SEQUENCE:')) {
          currentEvent.sequence = line.substring(9);
        } else if (line.startsWith('STATUS:')) {
          currentEvent.status = line.substring(7);
        } else if (line.startsWith('ORGANIZER')) {
          currentEvent.organizer = line;
        } else if (line.startsWith('ATTENDEE')) {
          currentEvent.attendees.push(line);
        }
      }
    }
    
    return events;
  }

  parseDateTimeFromICS(dtString) {
    // Handle different DTSTART/DTEND formats
    let dateTimeStr = '';
    
    if (dtString.includes('TZID=')) {
      // Format: DTSTART;TZID=America/Chicago:20240704T140000
      const colonIndex = dtString.lastIndexOf(':');
      if (colonIndex !== -1) {
        dateTimeStr = dtString.substring(colonIndex + 1);
      }
    } else if (dtString.includes(':')) {
      // Format: DTSTART:20240704T140000Z
      dateTimeStr = dtString.split(':')[1];
    }
    
    if (!dateTimeStr) return null;
    
    // Parse YYYYMMDDTHHMMSS format
    const year = parseInt(dateTimeStr.substring(0, 4));
    const month = parseInt(dateTimeStr.substring(4, 6)) - 1; // Month is 0-indexed
    const day = parseInt(dateTimeStr.substring(6, 8));
    const hour = parseInt(dateTimeStr.substring(9, 11));
    const minute = parseInt(dateTimeStr.substring(11, 13));
    const second = parseInt(dateTimeStr.substring(13, 15)) || 0;
    
    return new Date(year, month, day, hour, minute, second);
  }

  formatDateTime(date) {
    if (!date) return 'Invalid Date';
    
    return date.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  getTodaysEvents() {
    try {
      if (!fs.existsSync(this.calendarFile)) {
        console.log('Calendar file does not exist, downloading...');
        return [];
      }

      const icsContent = fs.readFileSync(this.calendarFile, 'utf8');
      const allEvents = this.parseICS(icsContent);
      
      // Get today in Central Time
      const today = new Date();
      const centralToday = new Date(today.toLocaleString("en-US", {timeZone: "America/Chicago"}));
      const todayDateStr = centralToday.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Filter events for today
      const todaysEvents = allEvents.filter(event => {
        const startDate = this.parseDateTimeFromICS(event.dtstart);
        if (!startDate) return false;
        
        const eventDateStr = startDate.toISOString().split('T')[0];
        return eventDateStr === todayDateStr;
      });
      
      // Sort by start time
      todaysEvents.sort((a, b) => {
        const dateA = this.parseDateTimeFromICS(a.dtstart);
        const dateB = this.parseDateTimeFromICS(b.dtstart);
        return dateA - dateB;
      });
      
      // Return first 3 events
      return todaysEvents.slice(0, 3).map(event => ({
        ...event,
        formattedStart: this.formatDateTime(this.parseDateTimeFromICS(event.dtstart)),
        formattedEnd: this.formatDateTime(this.parseDateTimeFromICS(event.dtend))
      }));
      
    } catch (error) {
      console.error('Error getting todays events:', error);
      return [];
    }
  }

  async refreshAndGetTodaysEvents() {
    try {
      await this.downloadICS();
      return this.getTodaysEvents();
    } catch (error) {
      console.error('Error refreshing calendar:', error);
      // Try to return cached events if download fails
      return this.getTodaysEvents();
    }
  }

  startAutoRefresh(intervalMinutes = 5) {
    if (this.downloadInterval) {
      clearInterval(this.downloadInterval);
    }
    
    // Download immediately
    this.downloadICS().catch(console.error);
    
    // Set up periodic refresh
    this.downloadInterval = setInterval(() => {
      this.downloadICS().catch(console.error);
    }, intervalMinutes * 60 * 1000);
    
    console.log(`Calendar auto-refresh started (every ${intervalMinutes} minutes)`);
  }

  stopAutoRefresh() {
    if (this.downloadInterval) {
      clearInterval(this.downloadInterval);
      this.downloadInterval = null;
      console.log('Calendar auto-refresh stopped');
    }
  }
}

module.exports = CalendarService;