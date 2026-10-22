import { AreaService } from "@/services/AreaService";
import { CameraAvailabilityService } from "@/services/CameraAvailabilityService";
import { CameraImageService } from "@/services/CameraImageService";
import { CameraRegistry } from "@/services/CameraRegistry";
import { LocationService } from "@/services/LocationService";
import { PhotoService } from "@/services/PhotoService";
import { ParkingService } from "@/services/ParkingService";
import { SituationService } from "@/services/SituationService";
import { SituationSummaryService } from "@/services/SituationSummaryService";
import { TripService } from "@/services/TripService";
import { VisionAnalyzer } from "@/services/VisionAnalyzer";

/** Process-wide service singletons (the in-memory caches live inside them). */
function createServices() {
  const location = new LocationService();
  const cameras = new CameraRegistry();
  const images = new CameraImageService(cameras);
  const availability = new CameraAvailabilityService(images);
  const vision = new VisionAnalyzer(images);
  const situation = new SituationService(cameras);
  const parking = new ParkingService();
  const trip = new TripService(parking, cameras);
  const photos = new PhotoService();
  const area = new AreaService(cameras);
  const summary = new SituationSummaryService(situation, cameras, vision, parking, trip, location);
  return {
    location,
    cameras,
    images,
    availability,
    vision,
    situation,
    parking,
    trip,
    photos,
    area,
    summary,
  };
}

export type Services = ReturnType<typeof createServices>;

const globalForServices = globalThis as unknown as { __streetServices?: Services };

export function services(): Services {
  globalForServices.__streetServices ??= createServices();
  return globalForServices.__streetServices;
}
