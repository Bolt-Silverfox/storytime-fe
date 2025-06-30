'use client';
import { getKidsService } from '@/lib/services';
import KidsCard from '@/components/kids-card';
import { motion as m } from 'framer-motion';
import { useEffect, useState } from 'react';
import kid1 from '@/public/kid-3.svg';
import kid2 from '@/public/kid-4.svg';
import kid3 from '@/public/kid-3.svg';
import kid4 from '@/public/kid-4.svg';

const KidsRow = () => {
  const [kids, setKids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Default avatar images to use when avatarUrl is null
  const defaultAvatars = [kid1, kid2, kid3, kid4];

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

  if (loading) {
    return (
      <div className='mt-10'>
        <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
          Your Kids
        </h2>
        <div className='grid grid-cols-4 gap-4'>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className='animate-pulse'>
              <div className='border-stone-100 bg-gray-200 px-4 py-3 rounded-3xl border-[0.5px] border-solid flex items-center gap-3 h-20'></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='mt-10'>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
        Your Kids
      </h2>
      <div className='grid grid-cols-4 gap-4'>
        {kids.map((kid, index) => (
          <m.div
            key={kid.id}
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <KidsCard {...kid} />
          </m.div>
        ))}
      </div>
    </div>
  );
};

export default KidsRow;
