import { villa } from "@/lib/villa";
import Breadcrumb from "@/components/property/Breadcrumb";
import PropertyHeader from "@/components/property/PropertyHeader";
import Gallery from "@/components/property/Gallery";
import Overview from "@/components/property/Overview";
import Description from "@/components/property/Description";
import BedroomSection from "@/components/property/BedroomSection";
import Facilities from "@/components/property/Facilities";
import Reviews from "@/components/property/Reviews";
import LocationMap from "@/components/property/LocationMap";
import HostSection from "@/components/property/HostSection";
import HouseRules from "@/components/property/HouseRules";
import ReservationCard from "@/components/property/ReservationCard";

export default function VillaViewPage() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 pb-20 pt-5 lg:px-7">
      {/* Same heading block as the live villa page (breadcrumb + title), just
          not pinned — this route is the static layout reference. */}
      <div className="pb-4">
        <Breadcrumb items={villa.breadcrumb} />
        <PropertyHeader
          title={villa.title}
          rating={villa.rating}
          reviewsCount={villa.reviewsCount}
        />
      </div>
      <Gallery hero={villa.images.hero} thumbs={villa.images.thumbs} />

      {/* Full-width overview under the gallery */}
      <div className="mt-8">
        <Overview subtitle={villa.subtitle} items={villa.overview} />
      </div>

      {/* Two-column: details (left) + sticky reservation (right) */}
      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[1fr_360px]">
        <div>
          <Description text={villa.description} />
          <BedroomSection
            image={villa.bedroom.image}
            title={villa.bedroom.title}
            detail={villa.bedroom.detail}
          />
          <Facilities facilities={villa.facilities} />
          <Reviews
            reviews={villa.reviews.map((r, i) => ({
              id: String(i),
              villaId: "0",
              villaTitle: villa.title,
              villaCity: "",
              rating: villa.rating,
              comment: r.text,
              authorName: r.name,
              authorAvatar: r.avatar,
              authorGender: "",
              createdAt: r.date,
              isMine: false,
            }))}
            rating={villa.rating}
            reviewsCount={villa.reviewsCount}
          />
          <LocationMap />
          <HostSection name={villa.host.name} avatar={villa.host.avatar} />
          <HouseRules rules={villa.houseRules} additional={villa.additionalRules} />
        </div>

        {/* Reservation sidebar */}
        <aside className="lg:col-start-2 lg:row-start-1">
          <div className="pt-6 lg:sticky lg:top-[88px]">
            <ReservationCard pricing={villa.pricing} rating={villa.rating} />
          </div>
        </aside>
      </div>
    </div>
  );
}
