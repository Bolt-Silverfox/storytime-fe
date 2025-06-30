import { getKidsService } from '@/lib/services';
import { useState, useEffect } from 'react';
import kid1 from '@/public/kid-3.svg';
import kid2 from '@/public/kid-4.svg';
import kid3 from '@/public/kid-3.svg';
import kid4 from '@/public/kid-4.svg';
import Image from 'next/image';

const KidPicker = ({
  onKidSelect,
}: {
  onKidSelect: (kidId: string) => void;
}) => {
  const [kids, setKids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultAvatars = [kid1, kid2, kid3, kid4];
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);

  useEffect(() => {
    const fetchKids = async () => {
      try {
        const kidsData = await getKidsService();
        const mappedKids = kidsData.map((kid: Kid, index: number) => ({
          id: kid.id,
          name: kid.name,
          age: `${kid.ageRange} yrs`,
          cstories: '0 Stories completed', // This could be fetched separately if needed
          img: kid.avatarUrl || defaultAvatars[index % defaultAvatars.length],
        }));
        setKids(mappedKids);
      } catch (error) {
        console.error('Failed to fetch kids:', error);
        setKids([]);
      } finally {
        setLoading(false);
      }
    };

    fetchKids();
  }, []);

  const handleKidSelect = (kid: Kid) => {
    setSelectedKidId(kid.id);
    localStorage.setItem('selectedKid', JSON.stringify(kid));
    onKidSelect(kid.id);
  };

  return (
    <div>
      <div className='flex items-center justify-between mt-10'>
        <div className=''>
          <h2 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
            YOUR KIDS
          </h2>
          <p className='text-[#4A413F] text-base not-italic font-normal leading-5'>
            Select a child and start enjoying unlimited stories
          </p>
        </div>
        <button className='bg-[#EC4007] text-white rounded-[3.12rem] py-3 px-6 font-abeezee text-base'>
          Add child
        </button>
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-8 mt-8'>
        {kids.map((kid) => (
          <div
            key={kid.id}
            className={`bg-white rounded-2xl border-[0.5px] border-[#F5F5F5] overflow-hidden cursor-pointer transition-all duration-200 ${
              selectedKidId === kid.id ? 'ring-2 ring-[#EC4007]' : ''
            }`}
            onClick={() => handleKidSelect(kid)}
          >
            <div className='w-full h-48 bg-gray-100 flex items-center justify-center'>
              <Image
                src={kid.img}
                alt={kid.name}
                width={400}
                height={200}
                className='object-cover w-full h-full'
              />
            </div>
            <div className='p-6'>
              <p className='text-[#EC4007] text-sm font-abeezee mb-1'>
                0 Stories completed
              </p>
              <h3 className='text-[#221D1D] text-2xl font-bold font-qilka mb-1'>
                {kid.name}
              </h3>
              <p className='text-[#221D1D] text-base font-abeezee'>{kid.age}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KidPicker;
