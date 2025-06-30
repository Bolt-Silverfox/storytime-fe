'use client';

import { useEffect, useState } from 'react';
import StoryCard from '@/components/story-card';
import { getStoryCategoriesService } from '@/lib/services';

// Import category images
import adventureAndAction from '@/public/category/Adventure-and-action.jpg';
import bedtimeStories from '@/public/category/Bedtime-stories.jpg';
import dramaAndFamilyStories from '@/public/category/Drama-and-family-stories.jpg';
import historicalFiction from '@/public/category/Historical-fiction.jpg';
import horrorAndGhostStories from '@/public/category/Horror-and-ghost-stories.jpg';
import humorAndSatire from '@/public/category/Humor-and-satire.jpg';
import mysteryAndDetective from '@/public/category/Mystery-and-detective.jpg';
import mythsAndLegends from '@/public/category/Myths-and-legends.jpg';
import nature from '@/public/category/Nature.jpg';
import ocean from '@/public/category/Ocean.jpg';
import robots from '@/public/category/Robots.jpg';
import romanceAndLoveStories from '@/public/category/Romance-and-love-stories.jpg';
import scienceFictionAndSpace from '@/public/category/Science-fiction-and-space.jpg';

interface Category {
  id: string;
  name: string;
  image: string;
  description: string;
}

const StoryCategory = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Category name to image mapping
  const categoryImageMap: { [key: string]: any } = {
    'Adventure & Action': adventureAndAction,
    'Bedtime Stories': bedtimeStories,
    'Cultural & Folklore Stories': mythsAndLegends, // Using myths-and-legends as closest match
    'Drama & Family Stories': dramaAndFamilyStories,
    'Educational & Learning Stories': nature, // Using nature as closest match
    'Fairy Tales': mythsAndLegends, // Using myths-and-legends as closest match
    'Fables & Morality Stories': nature, // Using nature as closest match
    'Fantasy & Magic': mythsAndLegends, // Using myths-and-legends as closest match
    'Historical Fiction': historicalFiction,
    'Holiday / Seasonal Stories': nature, // Using nature as closest match
    'Horror & Ghost Stories': horrorAndGhostStories,
    'Humor & Satire': humorAndSatire,
    'Myths & Legends': mythsAndLegends,
    Nature: nature,
    Ocean: ocean,
    'Mystery & Detective Stories': mysteryAndDetective,
    Robots: robots,
    'Romance & Love Stories': romanceAndLoveStories,
    'Science Fiction & Space': scienceFictionAndSpace,
  };

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getStoryCategoriesService();
        // Map categories to use local images
        const mappedCategories = data.map((category: Category) => ({
          ...category,
          image: categoryImageMap[category.name] || category.image, // Fallback to API image if not found
        }));
        setCategories(mappedCategories);
      } catch (err: any) {
        setError(err.message || 'Error fetching categories');
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  return (
    <div className='mt-[5.25rem]'>
      <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4'>
        STORIES BY CATEGORIES
      </h2>
      {loading ? (
        <div className='text-center text-gray-400'>Loading...</div>
      ) : error ? (
        <div className='text-center text-red-500'>{error}</div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {categories.map((category) => (
            <StoryCard
              key={category.id}
              img={category.image}
              title={category.name}
              desc={category.description}
              link={`/dashboard/category/${category.id}`}
              dynamic={false}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default StoryCategory;
