import RecommendedCard from '@/components/recommended-card';
import { recommended } from '@/data/kids';

const Recommended = () => {
  return (
    <div className='mt-[5.25rem]'>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
        RECOMMENDED STORIES FOR SIMON
      </h2>
      <div className='grid grid-cols-2 gap-12'>
        {recommended.map((item) => (
          <RecommendedCard key={item.id} {...item} />
        ))}
      </div>
    </div>
  );
};

export default Recommended;
