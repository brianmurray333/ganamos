/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@/components/ui/toast', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

import { LocationEditorModal } from '@/components/location-editor-modal'

let detailsCallback: ((place: any, status: string) => void) | null = null
let detailsCallbacks: Array<(place: any, status: string) => void> = []
const getPlacePredictions = vi.fn()
const getDetails = vi.fn((_req: any, cb: any) => {
  detailsCallback = cb
  detailsCallbacks.push(cb)
})
const geo = (lat: number, lng: number) => ({ geometry: { location: { lat: () => lat, lng: () => lng } } })

beforeEach(() => {
  detailsCallback = null
  detailsCallbacks = []
  getPlacePredictions.mockReset().mockImplementation((_req: any, cb: any) =>
    cb(
      [
        {
          place_id: 'p1',
          description: 'Dolores Park, San Francisco, CA, USA',
          structured_formatting: { main_text: 'Dolores Park', secondary_text: 'San Francisco, CA, USA' },
        },
      ],
      'OK'
    )
  )
  getDetails.mockClear()
  ;(window as any).google = {
    maps: {
      Map: vi.fn(),
      places: {
        AutocompleteService: vi.fn(() => ({ getPlacePredictions })),
        PlacesService: vi.fn(() => ({ getDetails })),
        AutocompleteSessionToken: vi.fn(),
        PlacesServiceStatus: { OK: 'OK' },
      },
    },
  }
})

function setup(currentLocation: any = { name: 'Somewhere', lat: 37.76, lng: -122.43 }) {
  const onOpenChange = vi.fn()
  const onLocationChange = vi.fn()
  const onPendingChange = vi.fn()
  render(
    <LocationEditorModal
      isOpen
      onOpenChange={onOpenChange}
      currentLocation={currentLocation}
      onLocationChange={onLocationChange}
      onPendingChange={onPendingChange}
    />
  )
  return { onOpenChange, onLocationChange, onPendingChange }
}

describe('LocationEditorModal', () => {
  it('closes as soon as a suggestion is tapped, then applies the location', async () => {
    const { onOpenChange, onLocationChange } = setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dolores' } })
    fireEvent.click(await screen.findByText('Dolores Park'))

    // Closed immediately, before place details arrive
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onLocationChange).not.toHaveBeenCalled()

    act(() => detailsCallback!({ geometry: { location: { lat: () => 37.7596, lng: () => -122.4269 } } }, 'OK'))
    expect(onLocationChange).toHaveBeenCalledWith({
      name: 'Dolores Park, San Francisco, CA, USA',
      lat: 37.7596,
      lng: -122.4269,
      displayName: 'Dolores Park, San Francisco, CA, USA',
    })
    expect(getDetails.mock.calls[0][0]).toMatchObject({ placeId: 'p1', fields: ['geometry'] })
  })

  it('biases search toward the current location without restricting place types', () => {
    setup({ name: 'Here', lat: 37.76, lng: -122.43 })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'park' } })
    const req = getPlacePredictions.mock.calls[0][0]
    expect(req.types).toBeUndefined()
    expect(req.locationBias).toEqual({ center: { lat: 37.76, lng: -122.43 }, radius: 20000 })
  })

  it('reports the pending place until its coordinates arrive', async () => {
    const { onPendingChange } = setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dolores' } })
    fireEvent.click(await screen.findByText('Dolores Park'))
    expect(onPendingChange).toHaveBeenLastCalledWith('Dolores Park, San Francisco, CA, USA')

    act(() => detailsCallback!(geo(37.7596, -122.4269), 'OK'))
    expect(onPendingChange).toHaveBeenLastCalledWith(null)
  })

  it('ignores a slower earlier lookup once a newer place was picked', async () => {
    const { onLocationChange } = setup()
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'dolores' } })
    fireEvent.click(await screen.findByText('Dolores Park'))
    fireEvent.change(input, { target: { value: 'dolores again' } })
    fireEvent.click(await screen.findByText('Dolores Park'))

    // Second lookup resolves first, then the stale first one arrives
    act(() => detailsCallbacks[1](geo(1, 1), 'OK'))
    act(() => detailsCallbacks[0](geo(2, 2), 'OK'))

    expect(onLocationChange).toHaveBeenCalledTimes(1)
    expect(onLocationChange.mock.calls[0][0]).toMatchObject({ lat: 1, lng: 1 })
  })
})
