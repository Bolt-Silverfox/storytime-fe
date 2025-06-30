import Image, { StaticImageData } from 'next/image';

const ModeCard = ({
  title,
  description,
  active,
  onClick,
  img,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
  img: StaticImageData;
}) => {
  return (
    <div
      className={`rounded-[1.5625rem] border-[0.5px] border-solid cursor-pointer hover:scale-105 transition-all duration-300 ${
        active
          ? 'bg-[#EC4007] shadow-[0px_0px_0px_4px_rgba(236,64,7,0.15)] rounded-3xl border-[#F84020] text-white'
          : 'bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] border-stone-100'
      }`}
      onClick={onClick}
    >
      <Image src={img} alt='background' />
      <div className='p-6'>
        <h3
          className={` text-xl not-italic font-normal leading-5 font-qilka ${
            active ? 'text-white' : 'text-[#221D1D]'
          }`}
        >
          {title}
        </h3>
        <p
          className={` text-xs not-italic font-normal leading-4 font-abeezee mt-0.5 ${
            active ? 'text-white/80' : 'text-[#4A413F]'
          }`}
        >
          {description}
        </p>
      </div>
    </div>
  );
};

export default ModeCard;
