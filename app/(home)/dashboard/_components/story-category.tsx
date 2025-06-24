import { storyCategory } from '@/data/kids';
import StoryCard from '@/components/story-card';

const StoryCategory = () => {
  return (
    <div className='mt-[5.25rem]'>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
        STORIES BY CATEGORIES
      </h2>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {storyCategory.map((category) => (
          <StoryCard
            key={category.id}
            img={category.img}
            title={category.title}
            desc={category.description}
            link={`/dashboard/category/${category.id}`}
            dynamic={false}
          />
        ))}
      </div>
    </div>
  );
};

export default StoryCategory;
