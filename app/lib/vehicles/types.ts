// VehicleCard mirrors the GSI1 INCLUDE projection in app/lib/db/migrations/001-add-gsi1.ts —
// keep the two in sync if the projection ever changes.
//
// bodyStyle, drivetrain, condition, fuelType and dealRating come straight from the enumerated
// domains in plans/dynamodb-schema.md. transmissionType and exteriorColorFamily aren't
// enumerated there, so these are inferred from the 165-row app/data/mocks.json sample and may
// need widening once real inventory shows values outside this set.

export type BodyStyle =
  | "SEDAN"
  | "SUV"
  | "TRUCK"
  | "COUPE"
  | "HATCHBACK"
  | "VAN"
  | "WAGON"
  | "CONVERTIBLE";

export type Drivetrain = "FWD" | "RWD" | "AWD" | "4WD";

export type TransmissionType = "AUTOMATIC" | "MANUAL" | "CVT" | "SINGLE_SPEED";

export type FuelType = "GAS" | "HYBRID" | "PLUGIN_HYBRID" | "ELECTRIC" | "DIESEL";

export type ExteriorColorFamily =
  | "WHITE"
  | "BLACK"
  | "SILVER"
  | "GRAY"
  | "RED"
  | "BLUE"
  | "GREEN"
  | "BROWN";

export type Condition = "NEW" | "USED" | "CERTIFIED";

export type DealRating = "GREAT" | "GOOD" | "FAIR" | null;

export interface VehicleCard {
  vehicleId: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  previousPrice: number | null;
  mileage: number;
  bodyStyle: BodyStyle;
  drivetrain: Drivetrain;
  transmissionType: TransmissionType;
  fuelType: FuelType;
  exteriorColorFamily: ExteriorColorFamily;
  condition: Condition;
  dealRating: DealRating;
  factoryUpgrades: number;
  thumbnailUrl: string;
}
