'use client';

import Image from 'next/image';
import slice1 from '@/public/slice-1.svg';
import slice2 from '@/public/slice-2.svg';
import slice3 from '@/public/slice-3.svg';
import slice4 from '@/public/slice-4.svg';
import timer from '@/public/timer.svg';
import arrowRight from '@/public/arrow-right.svg';
import { useEffect, useState } from 'react';
import { getDailyChallengesService } from '@/lib/services';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DailyChallenge {
  id: string;
  kidId: string;
  challengeId: string;
  completed: boolean;
  assignedAt: string;
}

const DailyChallenge = () => {
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDailyChallenges = async () => {
      try {
        const selectedKidData = localStorage.getItem('selectedKid');
        if (!selectedKidData) {
          setError('No kid selected');
          setLoading(false);
          return;
        }

        const selectedKid = JSON.parse(selectedKidData);
        const challengesData = await getDailyChallengesService(selectedKid.id);
        setChallenges(challengesData);
      } catch (error) {
        console.error('Failed to fetch daily challenges:', error);
        setError('Failed to load daily challenges');
      } finally {
        setLoading(false);
      }
    };

    fetchDailyChallenges();
  }, []);

  const getCompletedCount = () => {
    return challenges.filter((challenge) => challenge.completed).length;
  };

  const getDayStatus = (dayIndex: number) => {
    if (dayIndex >= challenges.length) return false;
    return challenges[dayIndex]?.completed || false;
  };

  if (loading) {
    return (
      <div className='px-[6.25rem] py-[3.9375rem] rounded-[2.625rem] bg-[#4807EC] w-full max-w-full flex flex-col gap-8 mt-[5.25rem]'>
        <div className='text-center text-white'>
          Loading daily challenges...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='px-[6.25rem] py-[3.9375rem] rounded-[2.625rem] bg-[#4807EC] w-full max-w-full flex flex-col gap-8 mt-[5.25rem]'>
        <div className='text-center text-red-300'>{error}</div>
      </div>
    );
  }

  return (
    <div className='px-[6.25rem] py-[3.9375rem] rounded-[2.625rem] bg-[#4807EC] w-full max-w-full flex flex-col gap-8 mt-[5.25rem]'>
      <div className='flex flex-row justify-between items-start w-full'>
        <div className='flex flex-col gap-2'>
          <h2 className='text-white text-[2.75rem] not-italic font-bold leading-[3.125rem] font-qilka'>
            Your daily story
            <br />
            challenge
          </h2>
          <p className='text-[#FEEAE6] text-xl font-normal font-abeezee mb-6'>
            Complete your daily challenge
            <br />
            to win amazing prices today
          </p>
          <div className='mt-2'>
            <p className='text-[#EDE6FE] text-xs not-italic font-normal leading-6 mb-2 font-abeezee opacity-80'>
              Daily challenge tracker
            </p>
            <div className='flex flex-row flex-wrap gap-2 w-3/5 font-abeezee'>
              {days.map((day, idx) => {
                const isCompleted = getDayStatus(idx);
                return (
                  <div
                    key={day}
                    className={`px-4 py-2 text-base not-italic font-normal leading-5 rounded-[3.125rem] border-[0.5px] border-solid w-fit flex items-center gap-2 ${
                      isCompleted
                        ? 'bg-green-500 text-white border-green-400'
                        : 'bg-red-500 text-[#EDE6FE] border-[#A583FB]'
                    }`}
                  >
                    <span className='text-white'>{day}</span>
                    {isCompleted ? (
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        width='16'
                        height='11'
                        viewBox='0 0 16 11'
                        fill='none'
                      >
                        <path
                          d='M14.6667 0.833984L10.1744 6.22466C8.39434 8.36079 7.50428 9.42886 6.33334 9.42886C5.16241 9.42886 4.27235 8.36079 2.49224 6.22466L1.33334 4.83398'
                          stroke='#221D1D'
                          strokeWidth='1.5'
                          strokeLinecap='round'
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        width='14'
                        height='14'
                        viewBox='0 0 14 14'
                        fill='none'
                      >
                        <path
                          d='M1.16666 1.16602L12.8333 12.8327M1.16668 12.8327L7.00001 6.99935L12.8333 1.16602'
                          stroke='#EDE6FE'
                          strokeWidth='1.5'
                          strokeLinecap='round'
                        />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className='relative flex'>
          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'>
            <p className='text-[#EDE6FE] text-center text-base not-italic font-normal leading-5 font-abeezee'>
              Week
            </p>
            <h5 className='text-[#ECC607] text-center text-[2.125rem] not-italic font-bold leading-10 font-qilka'>
              {getCompletedCount()}/4
            </h5>
          </div>
          <div className=''>
            <Image src={slice4} alt='slice4' width={123} height={125} />
            <Image
              src={slice3}
              alt='slice3'
              width={129}
              height={120}
              className='mt-4'
            />
          </div>
          <div className=''>
            <Image
              src={slice1}
              alt='slice1'
              width={125}
              height={124}
              className='ml-2'
            />
            <Image
              src={slice2}
              alt='slice2'
              width={120}
              height={128}
              className='mt-4 ml-2'
            />
          </div>
        </div>
      </div>
      {/* Challenge card */}
      <div className='w-full flex items-center bg-[#5E20F8] p-4 rounded-[3.125rem] border-[0.5px] border-solid border-[#A583FB] mt-2 relative font-abeezee'>
        <div className='flex items-center gap-3'>
          <Image src={timer} alt='timer' width={56} height={56} />
          <div className='flex flex-col'>
            <span className='text-[#EDE6FE] text-xs not-italic font-normal leading-6 font-abeezee opacity-80'>
              New challenge
            </span>
            <span className='text-[#EDE6FE] text-xl not-italic font-normal leading-6'>
              Learn a new word & meaning from the story "Gracefulness"
            </span>
          </div>
        </div>
        <div className='ml-auto flex items-center gap-4'>
          <span className='text-[#ECC607] text-center text-xl not-italic font-bold leading-6 font-qilka mr-8'>
            20:01
          </span>
          <div className=''>
            <Image src={arrowRight} alt='arrow right' width={24} height={24} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyChallenge;
