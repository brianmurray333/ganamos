import { NextResponse } from "next/server"

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      console.error("Google Maps API key not found")
      return new NextResponse("console.error('Google Maps API key not configured');", {
        status: 200,
        headers: {
          "Content-Type": "application/javascript",
        },
      })
    }

    // Return JavaScript that loads the Google Maps API
    const script = `
(function() {
  if (window.google && window.google.maps && window.google.maps.places) {
    return; // Already loaded
  }
  
  var script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places';
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    console.error('Failed to load Google Maps API');
  };
  document.head.appendChild(script);
})();`

    return new NextResponse(script, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (error) {
    console.error("Error in maps API route:", error)
    return new NextResponse("console.error('Error loading Google Maps API');", {
      status: 200,
      headers: {
        "Content-Type": "application/javascript",
      },
    })
  }
}
