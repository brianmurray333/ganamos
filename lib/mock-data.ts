export interface Post {
  id: number
  title: string
  content: string
  imageUrl: string
  latitude: number
  longitude: number
}

export const mockPosts: Post[] = [
  {
    id: 1,
    title: "Downtown Coffee Shop",
    content: "Enjoy a latte at our cozy downtown location.",
    imageUrl: "https://example.com/coffee1.jpg",
    latitude: 37.7749,
    longitude: -122.4194,
  },
  {
    id: 2,
    title: "Downtown Art Gallery",
    content: "Explore modern art in the heart of the city.",
    imageUrl: "https://example.com/art1.jpg",
    latitude: 37.7749,
    longitude: -122.4194,
  },
  {
    id: 3,
    title: "Central Park Picnic",
    content: "Relax and enjoy a picnic in beautiful Central Park.",
    imageUrl: "https://example.com/park1.jpg",
    latitude: 37.7849,
    longitude: -122.4094,
  },
  {
    id: 4,
    title: "Central Park Concert",
    content: "Attend a live music concert in Central Park.",
    imageUrl: "https://example.com/concert1.jpg",
    latitude: 37.7849,
    longitude: -122.4094,
  },
  {
    id: 5,
    title: "Downtown Restaurant",
    content: "Dine at our upscale downtown restaurant.",
    imageUrl: "https://example.com/restaurant1.jpg",
    latitude: 37.7749,
    longitude: -122.4194,
  },
  {
    id: 6,
    title: "Ocean Beach Sunset",
    content: "Watch the sunset at beautiful Ocean Beach.",
    imageUrl: "https://example.com/beach1.jpg",
    latitude: 37.7594,
    longitude: -122.5107,
  },
  {
    id: 7,
    title: "University Campus Library",
    content: "Study at the university campus library.",
    imageUrl: "https://example.com/library1.jpg",
    latitude: 37.8044,
    longitude: -122.2712,
  },
  {
    id: 8,
    title: "Shopping Mall Grand Opening",
    content: "Celebrate the grand opening of the new shopping mall.",
    imageUrl: "https://example.com/mall1.jpg",
    latitude: 37.7849,
    longitude: -122.4394,
  },
  {
    id: 9,
    title: "Central Park Jogging",
    content: "Enjoy a morning jog in Central Park.",
    imageUrl: "https://example.com/jogging1.jpg",
    latitude: 37.7849,
    longitude: -122.4094,
  },
  {
    id: 10,
    title: "Downtown Theater",
    content: "See a play at the downtown theater.",
    imageUrl: "https://example.com/theater1.jpg",
    latitude: 37.7749,
    longitude: -122.4194,
  },
  {
    id: 11,
    title: "University Campus Cafe",
    content: "Grab a coffee at the university campus cafe.",
    imageUrl: "https://example.com/cafe1.jpg",
    latitude: 37.8044,
    longitude: -122.2712,
  },
  {
    id: 12,
    title: "Central Park Yoga",
    content: "Join a yoga session in Central Park.",
    imageUrl: "https://example.com/yoga1.jpg",
    latitude: 37.7849,
    longitude: -122.4094,
  },
]
