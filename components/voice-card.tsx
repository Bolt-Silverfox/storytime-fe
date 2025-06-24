import Image from 'next/image';
import volume from '@/public/volume.svg';
import volumeActive from '@/public/volume-light.svg';

const VoiceCard = ({
  name,
  description,
  onListen,
  active = false,
  onClick,
}: {
  name: string;
  description: string;
  onListen: () => void;
  active?: boolean;
  onClick?: () => void;
}) => (
  <div
    className={` p-6 rounded-[1.5625rem] border-[0.5px] border-solid text-center flex flex-col items-center cursor-pointer hover:scale-105 transition-all duration-300 ${
      active
        ? 'bg-[#EC4007] shadow-[0px_0px_0px_4px_rgba(236,64,7,0.15)] rounded-3xl border-[#F84020] text-white'
        : 'bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] border-stone-100 '
    }`}
    onClick={onClick}
  >
    <h2
      className={`text-center text-xl not-italic font-bold leading-6 font-qilka ${
        active ? 'text-white' : 'text-[#221D1D]'
      }`}
    >
      {name}
    </h2>
    <p
      className={`text-xs not-italic font-normal leading-4 font-abeezee mt-0.5 ${
        active ? 'text-white/80' : 'text-[#4A413F]'
      }`}
    >
      {description}
    </p>
    <div
      className={` mt-6 shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2] hover:scale-105 transition-all duration-300 flex items-center gap-3 w-fit text-center ${
        active
          ? 'bg-[#F84020] text-white border-[#F84020]'
          : 'bg-white text-[#4A413F]'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onListen();
      }}
    >
      <Image src={active ? volumeActive : volume} alt='volume' />
      <p
        className={`text-xs not-italic font-normal leading-4 font-abeezee ${
          active ? 'text-white' : 'text-[#4A413F]'
        }`}
      >
        Listen
      </p>
    </div>
  </div>
);

export default VoiceCard;
