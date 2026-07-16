import volumeActive from '@/public/volume-light.svg';
import volume from '@/public/volume.svg';
import Image from 'next/image';

const VoiceCard = ({
  name,
  description,
  avatar,
  onListen,
  active = false,
  onClick,
  selectable = true,
}: {
  name: string;
  description: string;
  avatar?: string;
  onListen: (e: React.MouseEvent) => void;
  active?: boolean;
  onClick?: () => void;
  // When false the card can't be selected to change the reading voice: it
  // never shows the active/selected highlight and card clicks don't select.
  // The "Listen" preview still works so guests/free users can hear voices.
  selectable?: boolean;
}) => {
  // Only reflect the selected state when the card is actually selectable.
  const showActive = selectable && active;

  const handleCardSelect = () => {
    if (selectable) {
      onClick?.();
    }
  };

  return (
    <div
      className={` p-6 rounded-[1.5625rem] border-[0.5px] border-solid text-center flex flex-col items-center transition-all duration-300 ${
        selectable ? 'cursor-pointer hover:scale-105' : 'cursor-default'
      } ${
        showActive
          ? 'bg-[#EC4007] shadow-[0px_0px_0px_4px_rgba(236,64,7,0.15)] rounded-3xl border-[#F84020] text-white'
          : 'bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] border-stone-100 '
      }`}
      onClick={handleCardSelect}
      onKeyDown={(e) => {
        if (selectable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary host
        <img
          src={avatar}
          alt={name}
          className='mb-3 h-16 w-16 rounded-full object-cover'
        />
      ) : (
        <div
          className={`mb-3 flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
            showActive ? 'bg-white/20' : 'bg-[#FCE9CE]'
          }`}
        >
          🎙️
        </div>
      )}
      <h2
        className={`text-center text-xl not-italic font-bold leading-6 font-qilka ${
          showActive ? 'text-white' : 'text-[#221D1D]'
        }`}
      >
        {name}
      </h2>
      <p
        className={`text-xs not-italic font-normal leading-4 font-abeezee mt-0.5 ${
          showActive ? 'text-white/80' : 'text-[#4A413F]'
        }`}
      >
        {description}
      </p>
      <div
        className={` mt-6 shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] px-6 py-2.5 rounded-[3.125rem] border-[0.5px] border-solid border-[#FAF4F2] hover:scale-105 transition-all duration-300 flex items-center gap-3 w-fit text-center cursor-pointer ${
          showActive
            ? 'bg-[#F84020] text-white border-[#F84020]'
            : 'bg-white text-[#4A413F]'
        }`}
        onClick={(e) => {
          onListen(e);
          handleCardSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onListen(e as unknown as React.MouseEvent);
            handleCardSelect();
          }
        }}
      >
        <Image src={showActive ? volumeActive : volume} alt='volume' />
        <p
          className={`text-xs not-italic font-normal leading-4 font-abeezee ${
            showActive ? 'text-white' : 'text-[#4A413F]'
          }`}
        >
          Listen
        </p>
      </div>
    </div>
  );
};

export default VoiceCard;
