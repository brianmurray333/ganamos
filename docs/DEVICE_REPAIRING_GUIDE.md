# Device Re-pairing After Disconnect

## Current Behavior

When a device is disconnected from the web app:

1. **Web App**: Deletes the device record from the database (via `/api/device/remove`)
2. **Hardware Device**: 
   - Still has old `deviceId` and `pairingCode` in flash memory
   - On next fetch attempt (every 20 seconds), receives 404 response
   - Detects 404 → clears saved config → generates **new** pairing code
   - Displays new pairing code on screen

## Re-pairing Steps

1. **Wait for device to detect disconnection** (max 20 seconds after disconnect)
2. **Device will show new pairing code** (old pairing code is invalid)
3. **In web app**: Go to Connect Pet page
4. **Enter the NEW pairing code** shown on device
5. Device will reconnect automatically

## Technical Details

### Device Detection Logic
Located in `arduino-reference/satoshi_pet_heltec.ino` lines 311-319:
```cpp
if (!fetchSuccess && getLastHttpCode() == 404) {
  Serial.println("⚠️ Device not found with saved pairing code - clearing saved config");
  clearDeviceConfig();
  isPaired = false;
  generatePairingCode(); // Generates NEW pairing code
  displayPairingCode();
}
```

### Why New Pairing Code?
- Old pairing code was tied to deleted device record
- New pairing code allows fresh pairing
- Security: Prevents using old credentials after disconnect

## Potential Improvements

1. **Immediate Detection**: Force device to check immediately after disconnect (not just on next 20s cycle)
2. **User Feedback**: Show "Device Disconnected" message before showing pairing code
3. **Keep Same Code**: Consider keeping same pairing code if device is reconnecting within time window

## Testing

To test re-pairing:
1. Connect device to web app
2. Disconnect device from web app (Pet Settings → Unpair)
3. Wait up to 20 seconds
4. Device should show new pairing code
5. Reconnect using new pairing code

