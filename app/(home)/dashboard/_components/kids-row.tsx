'use client';
import { kids } from '@/data/kids';
import KidsCard from '@/components/kids-card';
import { motion as m } from 'framer-motion';

const KidsRow = () => {
  return (
    <div className='mt-10'>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
        Your Kids
      </h2>
      <div className='grid grid-cols-4 gap-4'>
        {kids.map((kid) => (
          <m.div
            key={kid.id}
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: kid.id * 0.1 }}
          >
            <KidsCard {...kid} />
          </m.div>
        ))}
      </div>
    </div>
  );
};

export default KidsRow;
