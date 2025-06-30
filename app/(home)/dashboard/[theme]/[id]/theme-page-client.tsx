'use client';

import Header from '@/components/header';
import arrow from '@/public/arrow-left.svg';
import Image from 'next/image';
import kid from '@/public/kid-1.png';
import search from '@/public/search.svg';
import RecommendedCard from '@/components/recommended-card';
import StoryCard from '@/components/story-card';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import VoiceSelector from '@/components/voice-selector';
import ModeSelector from '@/components/mode-selector';
import StoryReader from '@/components/story-reader';
import story2 from '@/public/story-2.png';
// Import theme images
import adventure from '@/public/theme/Adventure.jpg';
import betrayalAndRedemption from '@/public/theme/Betrayal-and-redemption.jpg';
import changeAndTransformation from '@/public/theme/Change-and-transformation.jpg';
import comingOfAge from '@/public/theme/Coming-of-age.jpg';
import courageAndBravery from '@/public/theme/Courage-and-bravery.jpg';
import emotional from '@/public/theme/Emotional.jpg';
import fantasy from '@/public/theme/Fantasy.jpg';
import freedomAndAdventure from '@/public/theme/Freedom-and-adventure.jpg';
import friendshipAndBelonging from '@/public/theme/Freindship-and-belonging.jpg';
import goodVsEvil from '@/public/theme/Good-vs-evil.jpg';
import greedVsGenerosity from '@/public/theme/Greed-vs-generosity.jpg';
import healingAndForgiveness from '@/public/theme/healing-andforgiveness.jpg';
import honestyAndPerseverance from '@/public/theme/Hoensty-and-perseverance.jpg';
import hopeAndPerseverance from '@/public/theme/Hope-and-perseverance.jpg';
import identityAndSelfDiscovery from '@/public/theme/Identity-and-self-discovery.jpg';
import justiceAndFairness from '@/public/theme/Justice-and-fairness.jpg';
import loveAndFamily from '@/public/theme/Love-and-family.jpg';
import sciFi from '@/public/theme/Sci-fi.jpg';
import trustAndLoyalty from '@/public/theme/Trust-and-loyalty.jpg';
import {
  getStoriesByThemeAndKidService,
  getStoryByIdService,
} from '@/lib/services';

interface ThemePageClientProps {
  theme: string;
}

interface Story {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string;
  [key: string]: any;
}

const ThemePageClient = ({ theme }: ThemePageClientProps) => {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(1);
  const [expand, setExpand] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [themeStories, setThemeStories] = useState<Story[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendedStories, setRecommendedStories] = useState<Story[]>([]);
  const [selectedKid, setSelectedKid] = useState<any>(null);

  // Theme name to image mapping
  const themeImageMap: { [key: string]: any } = {
    Adventure: adventure,
    'Betrayal & Redemption': betrayalAndRedemption,
    'Change & Transformation': changeAndTransformation,
    'Coming of Age': comingOfAge,
    'Courage / Bravery': courageAndBravery,
    Emotional: emotional,
    Fantasy: fantasy,
    'Freedom & Adventure': freedomAndAdventure,
    'Friendship & Belonging': friendshipAndBelonging,
    'Good vs. Evil': goodVsEvil,
    'Greed vs. Generosity': greedVsGenerosity,
    'Healing & Forgiveness': healingAndForgiveness,
    'Honesty & Integrity': honestyAndPerseverance,
    'Hope & Perseverance': hopeAndPerseverance,
    'Identity & Self-Discovery': identityAndSelfDiscovery,
    'Justice & Fairness': justiceAndFairness,
    'Love & Family': loveAndFamily,
    'Sci-Fi': sciFi,
    'Trust & Loyalty': trustAndLoyalty,
  };
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const selectedKidData = localStorage.getItem('selectedKid');
        if (!selectedKidData) {
          setError('No kid selected');
          return;
        }

        const selectedKid = JSON.parse(selectedKidData);
        setSelectedKid(selectedKid);
        // Fetch theme stories
        const stories = await getStoriesByThemeAndKidService(
          theme,
          selectedKid.id
        );
        setThemeStories(stories);

        // Randomly select 2 stories for recommendation
        if (stories.length > 0) {
          const shuffled = [...stories].sort(() => 0.5 - Math.random());
          const selected = shuffled.slice(0, 2);
          setRecommendedStories(selected);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to fetch stories');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [theme]);

  const handleModeSelect = (mode: string) => {
    setSelectedMode(mode);
  };

  const handleStorySelect = (storyId: string) => {
    setSelectedStoryId(storyId);
    setModal(true);
  };

  if (loading) {
    return (
      <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'>
        <Header white={false} />
        <div className='flex items-center justify-center h-64'>
          <div className='text-center text-gray-400'>Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !themeStories) {
    return (
      <div className='bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'>
        <Header white={false} />
        <div className='flex items-center justify-center h-64'>
          <div className='text-center'>
            <h1 className='text-[#221D1D] text-2xl font-qilka mb-4'>
              Story Not Found
            </h1>
            <p className='text-[#4A413F] font-abeezee'>
              {error || 'The requested story could not be found.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          backgroundImage: `linear-gradient(to bottom, #00000040, #00000040), url(${themeImageMap[theme]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
        className='bg-[#00000080] relative rounded-t-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2]  px-10 pt-[2.125rem] pb-[3.75rem] max-w-[85vw] mx-auto mt-12'
      >
        <Header white={true} />
        <div className='flex justify-between'>
          <div className='flex items-center gap-4 mt-10'>
            <Image src={arrow} alt='arrow' onClick={() => router.back()} />
            <Image
              src={themeImageMap[theme]}
              alt={theme}
              width={50}
              height={70}
              className='rounded-full object-cover border-[0.5px] border-solid border-[#FAF4F2]'
            />
            <h1 className='text-2xl font-bold text-white'>{theme} stories</h1>
          </div>
          <div className='flex items-center gap-2'>
            <Image src={kid} alt='kid' />
            <p className='text-white text-base not-italic font-normal leading-5 font-abeezee'>
              {selectedKid.name}
            </p>
          </div>
        </div>
      </div>
      <div className='bg-white rounded-b-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2] px-10 py-[2.125rem] max-w-[85vw] mx-auto font-qilka'>
        <div className='flex items-center gap-2 border-[0.5px] border-solid border-[#4A413F] rounded-[5.125rem] px-4 py-2 w-[20.625rem]'>
          <Image src={search} alt='search' />
          <input
            type='text'
            placeholder='Search story'
            className='bg-transparent outline-none text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee'
          />
        </div>
        <div className='mt-10'>
          <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4 uppercase'>
            {theme} STORIES TOP PICKS FOR {selectedKid?.name}
          </h2>
          <div className='grid grid-cols-2 gap-12'>
            {recommendedStories.map((item) => (
              <RecommendedCard
                key={item.id}
                image={item.coverImageUrl}
                title={item.title}
                description={item.description}
                setModal={() => handleStorySelect(item.id)}
                author={item.author}
              />
            ))}
          </div>
        </div>
        <div className='mt-20'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-12 gap-x-4'>
            {themeStories.map((item) => (
              <StoryCard
                key={item.id}
                img={item.coverImageUrl}
                title={item.title}
                desc={item.description}
                author={item.author}
                dynamic={true}
                setModal={() => handleStorySelect(item.id)}
              />
            ))}
          </div>
        </div>
      </div>
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

export default ThemePageClient;
