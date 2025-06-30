'use client';

import { useEffect, useState } from 'react';
import RecommendedCard from '@/components/recommended-card';
import Modal from '@/components/ui/modal';
import ModeSelector from '@/components/mode-selector';
import VoiceSelector from '@/components/voice-selector';
import StoryReader from '@/components/story-reader';
import story2 from '@/public/story-2.png';
import { getStoriesByKidIdService } from '@/lib/services';

interface Story {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string;
  [key: string]: any;
}

const Recommended = () => {
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(1);
  const [expand, setExpand] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kidName, setKidName] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  useEffect(() => {
    const fetchStories = async () => {
      try {
        const selectedKidData = localStorage.getItem('selectedKid');
        if (!selectedKidData) {
          setError('No kid selected');
          setLoading(false);
          return;
        }

        const selectedKid = JSON.parse(selectedKidData);
        setKidName(selectedKid.name);

        const storiesData = await getStoriesByKidIdService(selectedKid.id);

        // Select 2 random stories
        const shuffled = storiesData.sort(() => 0.5 - Math.random());
        const selectedStories = shuffled.slice(0, 2);

        setStories(selectedStories);
      } catch (error) {
        console.error('Failed to fetch stories:', error);
        setError('Failed to load stories');
      } finally {
        setLoading(false);
      }
    };

    fetchStories();
  }, []);

  const handleModeSelect = (mode: string) => {
    setSelectedMode(mode);
  };

  const handleStorySelect = (storyId: string) => {
    setSelectedStoryId(storyId);
    setModal(true);
  };

  return (
    <div className='mt-[5.25rem]'>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
        RECOMMENDED STORIES FOR {kidName ? kidName.toUpperCase() : ''}
      </h2>
      {loading ? (
        <div className='text-center text-gray-400'>Loading...</div>
      ) : error ? (
        <div className='text-center text-red-500'>{error}</div>
      ) : (
        <div className='grid grid-cols-2 gap-12'>
          {stories.map((item) => (
            <RecommendedCard
              key={item.id}
              title={item.title}
              description={item.description}
              image={item.coverImageUrl}
              author='Storytime AI'
              favorite={false}
              setModal={() => handleStorySelect(item.id)}
            />
          ))}
        </div>
      )}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={step === 1 ? 'Select preferred AI voice' : 'Choose story mode'}
        expandable={true}
        setExpand={setExpand}
        expand={expand}
      >
        {step === 1 && <VoiceSelector setStep={setStep} expand={expand} />}
        {step === 2 && (
          <ModeSelector
            setStep={setStep}
            expand={expand}
            onModeSelect={handleModeSelect}
          />
        )}
        {step === 3 && (
          <StoryReader
            description='A boy and a dog are best friends. They go on an adventure together and have a lot of fun. The boy is a superhero and the dog is a superhero too.'
            title='A boy and a dog'
            voice='Nimbus'
            img={story2.src}
            setStep={setStep}
            expand={expand}
            mode={selectedMode}
            storyId={selectedStoryId}
          />
        )}
      </Modal>
    </div>
  );
};

export default Recommended;
