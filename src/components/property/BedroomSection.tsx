import Image from "next/image";

export default function BedroomSection({
  image,
  title,
  detail,
}: {
  image: string;
  title: string;
  detail: string;
}) {
  return (
    <section className="border-b border-line py-6">
      <h3 className="mb-4 text-[18px] font-semibold text-primary">Your Bedroom</h3>
      <div className="relative aspect-[16/10] w-full max-w-[440px] overflow-hidden rounded-2xl sm:aspect-[4/3]">
        <Image
          src={image}
          alt={title}
          fill
          sizes="(max-width: 640px) 100vw, 440px"
          className="object-cover"
        />
      </div>
      <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
      <p className="text-[14px] text-body">{detail}</p>
    </section>
  );
}
