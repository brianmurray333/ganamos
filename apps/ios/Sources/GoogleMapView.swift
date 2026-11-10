import SwiftUI
import UIKit
import GoogleMaps
import MapKit

struct GoogleMapView: UIViewRepresentable {
    var posts: [GanamosPost]
    @Binding var selectedPost: GanamosPost?
    var cameraRegion: MKCoordinateRegion?

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> GMSMapView {
        let options = GMSMapViewOptions()
        if let region = cameraRegion {
            options.camera = GMSCameraPosition.camera(
                withLatitude: region.center.latitude,
                longitude: region.center.longitude,
                zoom: zoomLevel(from: region)
            )
        }
        let mapView = GMSMapView(options: options)
        mapView.delegate = context.coordinator
        context.coordinator.mapView = mapView
        context.coordinator.syncMarkers()
        return mapView
    }

    func updateUIView(_ uiView: GMSMapView, context: Context) {
        if let region = cameraRegion {
            let camera = GMSCameraPosition.camera(
                withLatitude: region.center.latitude,
                longitude: region.center.longitude,
                zoom: zoomLevel(from: region)
            )
            // Update camera if it has changed materially
            if abs(uiView.camera.target.latitude - camera.target.latitude) > 0.0001 ||
                abs(uiView.camera.target.longitude - camera.target.longitude) > 0.0001 ||
                abs(uiView.camera.zoom - camera.zoom) > 0.05 {
                uiView.animate(to: camera)
            }
        }
        context.coordinator.parent = self
        context.coordinator.syncMarkers()
    }

    private func zoomLevel(from region: MKCoordinateRegion) -> Float {
        // Approximate a Google Maps zoom from the latitude delta
        let latDelta = max(region.span.latitudeDelta, 1e-6)
        // 360 degrees at zoom 0; halve each level. Clamp to 3...20.
        let zoom = Float(log2(360.0 / latDelta))
        return max(3, min(20, zoom))
    }

    class Coordinator: NSObject, GMSMapViewDelegate {
        var parent: GoogleMapView
        weak var mapView: GMSMapView?
        var markerByID: [UUID: GMSMarker] = [:]

        init(_ parent: GoogleMapView) {
            self.parent = parent
        }

        func mapView(_ mapView: GMSMapView, didTap marker: GMSMarker) -> Bool {
            if let post = marker.userData as? GanamosPost {
                parent.selectedPost = post
                return true
            }
            return false
        }

        func syncMarkers() {
            guard let mapView else { return }
            let visibleIDs = Set(parent.posts.compactMap { post in
                (post.latitude != nil && post.longitude != nil) ? post.id : nil
            })
            // Remove markers that are no longer visible
            for (id, marker) in markerByID where !visibleIDs.contains(id) {
                marker.map = nil
                markerByID.removeValue(forKey: id)
            }
            // Add or update markers
            for post in parent.posts {
                guard let lat = post.latitude, let lng = post.longitude else { continue }
                let coord = CLLocationCoordinate2D(latitude: lat, longitude: lng)
                let marker = markerByID[post.id] ?? {
                    let m = GMSMarker()
                    m.userData = post
                    markerByID[post.id] = m
                    return m
                }()
                marker.position = coord
                marker.iconView = RewardBadgeMarkerView(amount: post.reward)
                marker.map = mapView
            }
        }
    }
}

private final class RewardBadgeMarkerView: UIView {
    init(amount: Int) {
        super.init(frame: CGRect(x: 0, y: 0, width: 36, height: 36))
        backgroundColor = .clear
        let host = UIHostingController(rootView: RewardBadge(amount: amount).scaleEffect(0.9))
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            host.view.topAnchor.constraint(equalTo: topAnchor),
            host.view.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        // Layout immediately so Google Maps gets a correct intrinsic size
        layoutIfNeeded()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

