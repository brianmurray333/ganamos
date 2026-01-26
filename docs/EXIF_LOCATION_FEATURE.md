# 📍 Automatic Location Detection Feature

## Overview

The app now automatically detects and populates the issue location based on:
- **In-app camera photos**: Uses current device location (GPS/geolocation)
- **Camera roll uploads**: Extracts GPS coordinates from photo's EXIF metadata

No more manual location entry! The location is automatically populated when a photo is captured or uploaded.

## How It Works

### 1. **Photo Capture Methods**
Users can now:
- **Take a photo** with the in-app camera → Auto-populates current device location
- **Upload from camera roll** → Auto-populates location from photo's EXIF GPS data

### 2. **Location Detection**

**For In-App Camera Photos:**
- Automatically gets user's current device location when photo is taken
- Uses browser's Geolocation API
- Caches location for better performance

**For Uploaded Photos:**
- The `exifr` library reads the photo's EXIF metadata
- Extracts GPS coordinates (latitude, longitude) if available
- Also extracts altitude and timestamp when present

### 3. **Reverse Geocoding**
The GPS coordinates are then:
- Sent to Google Maps Geocoding API
- Converted to a human-readable address (e.g., "San Francisco, CA")
- Auto-populated in the location field

### 4. **User Feedback**
Users see:
- Location field automatically filled in (silently, no toast notification)
- Loading indicator while detecting location
- They can still change it manually if needed

## Implementation Details

### Files Modified

#### 1. **`lib/exif.ts`** (NEW)
Created utility functions for EXIF extraction:

```typescript
// Extract GPS from image file
extractExifLocation(file: File | Blob): Promise<ExifLocation | null>

// Extract GPS from base64 data URL
extractExifLocationFromDataUrl(dataUrl: string): Promise<ExifLocation | null>

// Quick check if image has GPS data
hasGpsData(file: File | Blob): Promise<boolean>
```

#### 2. **`app/post/new/page.tsx`**
Updated the main post creation flow:
- Modified `handleCapture()` to auto-detect current location when taking in-app photos
- Added `handleFileUpload()` function with EXIF extraction for uploaded photos
- Added file upload option to camera interface
- Auto-populates location for both camera and uploaded photos

#### 3. **`app/new/page.tsx`**
Updated the simple post creation flow:
- Enhanced `handleImageUpload()` to extract EXIF data
- Auto-populates location using the API endpoint

### Dependencies

**Added Package:**
```bash
npm install exifr
```

## User Experience

### Before:
1. User takes photo or uploads from camera roll
2. User manually clicks "Get Location" button
3. User enters or selects location
4. Location might not match where photo was taken

### After:

**Taking a photo with in-app camera:**
1. User takes photo
2. ✨ **Location automatically detected from current position**
3. User confirms or adjusts location if needed

**Uploading from camera roll:**
1. User uploads photo from camera roll
2. ✨ **Location automatically detected from photo's EXIF GPS data**
3. User confirms or adjusts location if needed

## Privacy Considerations

### EXIF Data is NOT Stripped
- When users upload photos, EXIF metadata is preserved in the uploaded file
- This includes GPS coordinates, camera model, timestamp, etc.
- **Important:** This could reveal precise location information (home address, etc.)

### Recommendation
Consider adding an option to strip EXIF data before uploading:
```typescript
import exifr from 'exifr'

async function stripExif(file: File): Promise<Blob> {
  // Load image without metadata and re-encode
  const img = new Image()
  img.src = URL.createObjectURL(file)
  await img.decode()
  
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d')?.drawImage(img, 0, 0)
  
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.95)
  })
}
```

## Testing

### To Test with Real GPS Data:

1. **Take a photo with iPhone/Android camera** (make sure location is enabled)
2. **Transfer photo to computer or test directly on mobile**
3. **Go to post creation page** (`/post/new`)
4. **Click "📤 Upload from Camera Roll"**
5. **Select the photo you just took**
6. **Verify:**
   - Console shows: `📍 Found GPS in photo EXIF`
   - Toast appears with location name
   - Location field is auto-filled
   - Coordinates match where photo was taken

### Sample Test Photos:
You can create test photos with different locations or download sample photos with EXIF data from:
- Your own iPhone/Android photos
- Sample image datasets online

### Console Logs:

**When taking photo with in-app camera:**
```
✅ Auto-populated location from current position: San Francisco, CA
```

**When uploading photo with EXIF GPS:**
```
📍 Found GPS in photo EXIF: { latitude: 37.7749, longitude: -122.4194 }
✅ Auto-populated location from photo: San Francisco, CA
```

**When no GPS data in uploaded photo:**
```
No GPS data found in image
```

## Error Handling

The feature gracefully handles errors:
- **No EXIF data:** Silently continues, user enters location manually
- **Geocoding fails:** Falls back to coordinates display
- **Network error:** Logs error, user can still enter location manually
- **Non-critical:** Never blocks post creation

## Benefits

1. **Better UX:** Users don't have to remember/type where photo was taken
2. **Accurate Location:** GPS coordinates are more precise than manual entry
3. **Faster:** One less field to fill out manually - fully automatic!
4. **Mobile-friendly:** Especially useful on mobile devices
5. **Works for both methods:** Whether taking a new photo or uploading an old one

## Future Enhancements

### Potential Features:
1. **EXIF stripping option** - Privacy toggle to remove metadata before upload
2. **Timestamp detection** - Use photo date/time for older issues
3. **Camera model display** - Show what device captured the photo
4. **Batch upload** - Handle multiple photos with different locations
5. **EXIF preview** - Show user what metadata exists before uploading

### Performance Optimization:
- Cache EXIF extraction results
- Lazy-load exifr library
- Process EXIF in Web Worker for large files

## Known Limitations

1. **In-app camera photos have no EXIF:** Uses device geolocation instead (still works, just different method)
2. **Privacy concern:** Original EXIF data is preserved in uploaded images from camera roll
3. **Requires GPS-enabled photos:** For camera roll uploads, not all photos have location data
4. **Google API dependency:** Reverse geocoding requires Google Maps API
5. **Location permissions:** User must grant location access for in-app camera photos

## API Usage

### Google Maps Geocoding API
- Called once per photo upload (if GPS exists)
- Cached for 1 hour to reduce API calls
- Falls back to coordinates if API fails

### Cost Estimate:
- $5 per 1,000 geocoding requests (after free tier)
- Free tier: 40,000 requests/month

---

## Quick Reference

### Check if Image Has GPS:
```typescript
import { hasGpsData } from '@/lib/exif'

const file = // ... get file
const hasGPS = await hasGpsData(file)
console.log('Photo has GPS:', hasGPS)
```

### Extract Location:
```typescript
import { extractExifLocation } from '@/lib/exif'

const file = // ... get file
const location = await extractExifLocation(file)
if (location) {
  console.log(location.latitude, location.longitude)
}
```

### Manual Testing:
```bash
# Test with a sample image
# 1. Take a photo with your phone camera (location enabled)
# 2. Transfer to your device
# 3. Go to http://localhost:3000/post/new
# 4. Click "Upload from Camera Roll"
# 5. Select the photo
# 6. Check console and location field
```

---

**Implemented:** October 2025  
**Status:** ✅ Active and working

