'use client';

import { useEffect, useState } from 'react';
import StoryCard from '@/components/story-card';
import { getStoryThemesService } from '@/lib/services';

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

interface Theme {
  id: string;
  name: string;
  image: string;
  description: string;
}

const ThemeStory = () => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    const fetchThemes = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getStoryThemesService();
        // Map themes to use local images
        const mappedThemes = data.map((theme: Theme) => ({
          ...theme,
          image: themeImageMap[theme.name] || theme.image, // Fallback to API image if not found
        }));
        setThemes(mappedThemes);
      } catch (err: any) {
        setError(err.message || 'Error fetching themes');
        setThemes([]);
      } finally {
        setLoading(false);
      }
    };
    fetchThemes();
  }, []);

  return (
    <div className='mt-[5.25rem]'>
      <h2 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
        HERE ARE YOUR STORIES
      </h2>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4 uppercase mt-6'>
        Stories by theme
      </h2>
      {loading ? (
        <div className='text-center text-gray-400'>Loading...</div>
      ) : error ? (
        <div className='text-center text-red-500'>{error}</div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {themes.map((theme) => (
            <StoryCard
              key={theme.id}
              img={theme.image}
              title={theme.name}
              desc={theme.description}
              link={`/dashboard/${theme.name}/${theme.id}`}
              dynamic={false}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ThemeStory;
