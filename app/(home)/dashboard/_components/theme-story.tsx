import StoryCard from '@/components/story-card';
import { stories } from '@/data/kids';

const ThemeStory = () => {
  return (
    <div className='mt-[5.25rem]'>
      <h2 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
        HERE ARE YOUR STORIES
      </h2>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4 uppercase mt-6'>
        Stories by theme
      </h2>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            img={story.img}
            title={story.title}
            desc={story.description}
            link={`/dashboard/${story.title}/${story.id}`}
            dynamic={false}
          />
        ))}
      </div>
    </div>
  );
};

export default ThemeStory;
