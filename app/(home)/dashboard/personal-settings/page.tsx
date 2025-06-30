'use client';

import Header from '@/components/header';
import { getKidsService, getUserFromStorage } from '@/lib/services';
import { cn } from '@/lib/utils';
import avatar from '@/public/avatar-big.png';
import kid1 from '@/public/kid-3.svg';
import kid2 from '@/public/kid-4.svg';
import kid3 from '@/public/kid-3.svg';
import kid4 from '@/public/kid-4.svg';
import Image from 'next/image';
import { useEffect, useState, useRef, useCallback } from 'react';
import KidsCard from '@/components/kids-card';
import Modal from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { countries } from '@/data/countries';
import stella from '@/public/stella.png';
import danny from '@/public/danny.png';
import oliva from '@/public/oliva.png';
import henry from '@/public/henry.png';
import ella from '@/public/ella.png';
import noah from '@/public/noah.png';

const PersonalSettingsPage = () => {
  const user = getUserFromStorage();
  const [kids, setKids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addKidOpen, setAddKidOpen] = useState(false);
  const [editKidOpen, setEditKidOpen] = useState(false);
  const [selectedKid, setSelectedKid] = useState<any | null>(null);
  const [kidForm, setKidForm] = useState({ name: '', age: '', img: '' });
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [form, setForm] = useState({
    title: user?.title || 'Mrs',
    name: user?.name || '',
    language: user?.profile?.language || 'English',
    country: user?.profile?.country || 'Nigeria',
    kids: kids.length ? String(kids.length) : '1',
  });
  const [showRemoveKidModal, setShowRemoveKidModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showDeleteReasonModal, setShowDeleteReasonModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [deleteStep, setDeleteStep] = useState(1);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);

  // Default avatar images to use when avatarUrl is null
  const defaultAvatars = [kid1, kid2, kid3, kid4];

  const avatarOptions = [
    { name: 'Stella', avatar: stella },
    { name: 'Danny', avatar: danny },
    { name: 'Olivia', avatar: oliva },
    { name: 'Henry', avatar: henry },
    { name: 'Ella', avatar: ella },
    { name: 'Noah', avatar: noah },
  ];

  const deleteReasons = [
    'I am not sure about the privacy',
    'It is just not worth the cost right now',
    'We are not really using it anymore',
    "I didn't love the story content",
    "The app has too many bugs or it's hard to use",
    'We have found something else that works better',
    'We signed up by mistake.',
    'Others',
  ];

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

  const handleFormChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    setEditOpen(false);
    // Save logic here
  };

  const handleEditKid = (kid: any) => {
    setSelectedKid(kid);
    setKidForm({ name: kid.name, age: kid.age, img: kid.img });
    setEditKidOpen(true);
  };

  const handleKidFormChange = (field: string, value: string) => {
    setKidForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveKid = () => {
    setEditKidOpen(false);
    // Save logic for kid here
  };

  const handleRemoveKid = useCallback(() => {
    setShowRemoveKidModal(true);
    setEditKidOpen(false);
  }, []);

  const confirmRemoveKid = () => {
    setShowRemoveKidModal(false);
    setEditKidOpen(false);
    // Remove logic for kid here
  };

  const cancelRemoveKid = () => {
    setShowRemoveKidModal(false);
  };

  const handleDeleteAccountClick = () => setShowDeleteAccountModal(true);
  const handleDeleteAccountCancel = () => setShowDeleteAccountModal(false);
  const handleDeleteAccountConfirm = () => {
    setShowDeleteAccountModal(false);
    setShowDeleteReasonModal(true);
  };
  const handleDeleteReasonProceed = () => {
    setShowDeleteReasonModal(false);
    setShowConfirmDeleteModal(true);
  };
  const handleDeleteReasonCancel = () => {
    setShowDeleteReasonModal(false);
    setDeleteReason('');
    setOtherReason('');
  };
  const handleDeleteConfirmCancel = () => setShowDeleteConfirmModal(false);
  const handleDeleteConfirm = () => {
    setShowDeleteConfirmModal(false);
    // Placeholder: log out user here
    window.location.href = '/login';
  };

  return (
    <div
      className={cn(
        'bg-white rounded-[2.5625rem] border-[0.5px] border-solid border-[#FAF4F2]  px-10 py-[2.125rem] max-w-[85vw] mx-auto my-12'
      )}
    >
      <Header white={false} />
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-8'>
          <Image
            src={user?.avatarUrl || avatar}
            alt='avatar'
            width={100}
            height={100}
            className='rounded-full'
          />
          <p className='text-[#0731EC] text-base not-italic font-normal leading-5 rounded-[1.6875rem] font-abeezee cursor-pointer hover:scale-105 transition-all duration-300'>
            Change image
          </p>
        </div>
        <button
          className='bg-[#EC4007] text-white px-[3.12rem] font-abeezee py-4 cursor-pointer hover:scale-105 transition-all duration-300 rounded-[3.125rem] font-semibold'
          onClick={() => setEditOpen(true)}
        >
          Edit profile
        </button>
      </div>
      <div className='grid grid-cols-3 gap-y-16 gap-x-12 mt-8'>
        <div>
          <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
            Title
          </p>
          <p className='text-[#221D1D] text-xl not-italic font-normal leading-6 font-abeezee'>
            {user?.title || 'Mrs'}
          </p>
        </div>
        <div>
          <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
            Full name
          </p>
          <p className='text-[#221D1D] text-xl not-italic font-normal leading-6 font-abeezee'>
            {user?.name || ''}
          </p>
        </div>
        <div className='opacity-50'>
          <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
            Email address
          </p>
          <p className='text-[#4A413F] text-xl not-italic font-normal leading-6 font-abeezee'>
            {user?.email || ''}
          </p>
        </div>
        <div>
          <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
            Language
          </p>
          <p className='text-[#221D1D] text-xl not-italic font-normal leading-6 font-abeezee'>
            {user?.profile?.language || 'English'}
          </p>
        </div>
        <div>
          <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
            Country
          </p>
          <p className='text-[#221D1D] text-xl not-italic font-normal leading-6 font-abeezee'>
            {user?.profile?.country || 'Nigeria'}
          </p>
        </div>
        <div>
          <p className='text-[#4A413F] text-xs not-italic font-normal leading-4 font-abeezee'>
            No of kids
          </p>
          <p className='text-[#221D1D] text-xl not-italic font-normal leading-6 font-abeezee'>
            {kids.length} kids
          </p>
        </div>
      </div>
      <div className='mt-16'>
        <h2 className='text-[#4A413F] text-base not-italic font-normal leading-5 font-abeezee mb-4 uppercase'>
          Kids Details
        </h2>
        <div className='grid grid-cols-2 gap-y-8 gap-x-12'>
          {kids.map((kid) => (
            <KidsCard
              key={kid.id}
              {...kid}
              edit={true}
              stories={true}
              handleEdit={() => {
                handleEditKid(kid);
                setAddKidOpen(true);
              }}
            />
          ))}
        </div>
      </div>
      <div
        className='mt-16 flex items-center justify-between cursor-pointer bg-[#EC4007] shadow-[0px_0px_0px_4px_rgba(236,64,7,0.15)] rounded-3xl border-[0.5px] border-solid border-[#F84020] hover:scale-105 transition-all duration-300 py-10 px-8'
        onClick={handleDeleteAccountClick}
      >
        <div className=''>
          <h2 className='text-[#fff] text-base not-italic font-normal leading-5 font-abeezee mb-2 uppercase'>
            Delete account
          </h2>
          <p className='text-[#fff] text-xs not-italic font-normal leading-4 font-abeezee'>
            Delete your account and all associated data
          </p>
        </div>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='6'
          height='12'
          viewBox='0 0 6 12'
          fill='none'
        >
          <path
            d='M1 1L2.76297 2.74731C4.1689 4.14075 4.87187 4.83747 4.98011 5.68667C5.00663 5.89473 5.00663 6.10527 4.98011 6.31333C4.87187 7.16252 4.1689 7.85925 2.76297 9.25269L1 11'
            stroke='white'
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </svg>
      </div>
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title='Edit profile'
      >
        <form className='flex flex-col gap-6'>
          <div>
            <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
              Title
            </label>
            <Select
              value={form.title}
              onValueChange={(v) => handleFormChange('title', v)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select title' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='Mr'>Mr</SelectItem>
                <SelectItem value='Mrs'>Mrs</SelectItem>
                <SelectItem value='Ms'>Ms</SelectItem>
                <SelectItem value='Dr'>Dr</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
              Full name
            </label>
            <Input
              value={form.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              placeholder='Enter your full name'
            />
          </div>
          <div>
            <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
              Language
            </label>
            <Select
              value={form.language}
              onValueChange={(v) => handleFormChange('language', v)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select language' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='English'>English</SelectItem>
                <SelectItem value='French'>French</SelectItem>
                <SelectItem value='Spanish'>Spanish</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
              Country
            </label>
            <Select
              value={form.country}
              onValueChange={(v) => handleFormChange('country', v)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select country' />
              </SelectTrigger>
              <SelectContent>
                {countries.map((country) => (
                  <SelectItem key={country} value={country}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
              No of Kids
            </label>
            <Select
              value={form.kids}
              onValueChange={(v) => handleFormChange('kids', v)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select number of kids' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='1'>1</SelectItem>
                <SelectItem value='2'>2</SelectItem>
                <SelectItem value='3'>3</SelectItem>
                <SelectItem value='4'>4</SelectItem>
                <SelectItem value='5'>5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type='button'
            className='w-1/2 mx-auto mt-[30%] mr-0 bg-[#EC4007] text-white rounded-full py-6 cursor-pointer hover:scale-105 transition-all duration-300 font-abeezee text-base'
            onClick={handleSave}
          >
            Save changes
          </Button>
        </form>
      </Modal>
      <Modal
        open={editKidOpen}
        onClose={() => setEditKidOpen(false)}
        title='Edit child details'
      >
        {selectedKid && (
          <form className='flex flex-col justify-between gap-6 h-[78vh]'>
            {!showAvatarSelector ? (
              <>
                <div className='flex flex-col gap-6'>
                  <div className='flex  items-center gap-6 mb-4'>
                    <Image
                      src={selectedKid.img}
                      alt={selectedKid.name}
                      width={60}
                      height={60}
                      className='rounded-full'
                    />
                    <button
                      type='button'
                      className='text-[#0731EC] text-sm font-abeezee mt-1 mb-2'
                      onClick={() => setShowAvatarSelector(true)}
                    >
                      Change image
                    </button>
                  </div>
                  <div>
                    <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
                      Name
                    </label>
                    <Input
                      value={kidForm.name}
                      onChange={(e) =>
                        handleKidFormChange('name', e.target.value)
                      }
                      placeholder='Enter child name'
                    />
                  </div>
                  <div>
                    <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
                      Age
                    </label>
                    <Select
                      value={kidForm.age}
                      onValueChange={(v) => handleKidFormChange('age', v)}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Select age range' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='2 - 3 yrs'>2 - 3 yrs</SelectItem>
                        <SelectItem value='4 - 6 yrs'>4 - 6 yrs</SelectItem>
                        <SelectItem value='7 - 9 yrs'>7 - 9 yrs</SelectItem>
                        <SelectItem value='10+ yrs'>10+ yrs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className='flex justify-between gap-4 mt-8'>
                  <Button
                    type='button'
                    variant='outline'
                    className='w-1/2 border-[#EC4007] text-[#EC4007] hover:bg-[#FEEAE6] rounded-full py-6 cursor-pointer font-abeezee text-base'
                    onClick={handleRemoveKid}
                  >
                    Remove child
                  </Button>
                  <Button
                    type='button'
                    className='w-1/2 bg-[#EC4007] text-white rounded-full py-6 cursor-pointer font-abeezee text-base'
                    onClick={handleSaveKid}
                  >
                    Save changes
                  </Button>
                </div>
              </>
            ) : (
              <div className='flex flex-col gap-6'>
                <h2 className='text-lg font-bold font-qilka mt-4'>
                  Select avatar
                </h2>
                <p className='text-[#4A413F] text-xs font-abeezee px-8 mb-2'>
                  Select customized avatar to save time
                </p>
                <div className='grid grid-cols-2 gap-4 px-8'>
                  {avatarOptions.map((option) => (
                    <button
                      key={option.name}
                      type='button'
                      className={`flex items-center gap-2.5 rounded-2xl border border-[#FAF4F2] bg-white p-6 shadow-[0_0_17px_0_#221D29]/5 w-full ${
                        kidForm.img === option.avatar.src
                          ? 'border-[#FB9583] ring-2 ring-[#FB9583]/50'
                          : ''
                      }`}
                      onClick={() => {
                        setKidForm((prev) => ({
                          ...prev,
                          img: option.avatar.src,
                        }));
                        setShowAvatarSelector(false);
                      }}
                    >
                      <Image
                        src={option.avatar}
                        className='rounded-full'
                        height={40}
                        width={40}
                        alt={option.name}
                      />
                      <span className='text-[#221D1D] truncate font-abeezee'>
                        {option.name}
                      </span>
                      <span className='ml-auto'>
                        <input
                          type='radio'
                          checked={kidForm.img === option.avatar.src}
                          readOnly
                        />
                      </span>
                    </button>
                  ))}
                </div>
                <div className='flex items-center gap-[5px] my-4 px-8'>
                  <div className='flex-1 h-px bg-[#F5F5F4]' />
                  <span className='uppercase text-[10px] text-[#F5F5F4] font-abeezee'>
                    OR
                  </span>
                  <div className='flex-1 h-px bg-[#F5F5F4]' />
                </div>
                <div className='px-8 space-y-2'>
                  <h2 className='text-lg font-bold font-qilka mb-1'>
                    Upload image
                  </h2>
                  <p className='text-[#4A413F] text-xs font-abeezee mb-2'>
                    Upload your child image instead
                  </p>
                  <label className='block rounded-[20px] border border-dashed border-[#FB9583] bg-[#FFF6F3] py-8 text-center cursor-pointer'>
                    <input
                      type='file'
                      accept='image/*'
                      className='hidden'
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const url = URL.createObjectURL(e.target.files[0]);
                          setKidForm((prev) => ({ ...prev, img: url }));
                          setShowAvatarSelector(false);
                        }
                      }}
                    />
                    <span className='flex flex-col items-center justify-center'>
                      <svg
                        width='32'
                        height='32'
                        fill='none'
                        xmlns='http://www.w3.org/2000/svg'
                      >
                        <path
                          d='M16 21.333a5.333 5.333 0 1 0 0-10.666 5.333 5.333 0 0 0 0 10.666Z'
                          stroke='#EC4007'
                          strokeWidth='2'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                        <path
                          d='M28 16c0 6.627-5.373 12-12 12S4 22.627 4 16 9.373 4 16 4s12 5.373 12 12Z'
                          stroke='#EC4007'
                          strokeWidth='2'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                      </svg>
                      <span className='text-[#EC4007] font-semibold'>
                        Upload image
                      </span>
                    </span>
                  </label>
                  <p className='text-[#4A413F] text-xs font-abeezee mt-2'>
                    Accepted files: PNG, JPEG, JPG not more than 5MB
                  </p>
                </div>
                <Button
                  type='button'
                  className='w-1/2 mx-auto mt-8 bg-[#EC4007]/10 text-[#EC4007] rounded-full py-4 font-abeezee text-base cursor-not-allowed'
                  disabled
                >
                  Upload avatar
                </Button>
              </div>
            )}
          </form>
        )}
      </Modal>
      {showRemoveKidModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'>
          <div className='bg-white rounded-2xl shadow-lg p-8 w-full max-w-md mx-4 relative'>
            <button
              className='absolute top-4 right-4 text-xl text-gray-400 hover:text-gray-600'
              onClick={cancelRemoveKid}
              aria-label='Close'
            >
              &times;
            </button>
            <h2 className='text-[#221D1D] text-base font-abeezee mb-4'>
              Remove child
            </h2>
            <p className='text-[#221D1D] text-sm font-abeezee mb-8'>
              You are about to remove a child, this would see all the data
              attached to this child lost once this action is taken. Are you
              sure you want to remove this child?
            </p>
            <div className='flex justify-between gap-4'>
              <button
                type='button'
                className='w-1/2 border border-[#EC4007] text-[#EC4007] hover:bg-[#FEEAE6] rounded-full py-4 font-abeezee text-base'
                onClick={cancelRemoveKid}
              >
                Cancel
              </button>
              <button
                type='button'
                className='w-1/2 bg-[#EC4007] text-white rounded-full py-4 font-abeezee text-base'
                onClick={confirmRemoveKid}
              >
                Remove child
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteAccountModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'>
          <div className='bg-white rounded-2xl shadow-lg p-8 w-full max-w-md mx-4 relative'>
            <button
              className='absolute top-4 right-4 text-xl text-gray-400 hover:text-gray-600'
              onClick={handleDeleteAccountCancel}
              aria-label='Close'
            >
              &times;
            </button>
            <h2 className='text-[#221D1D] text-base font-abeezee mb-4'>
              Delete account
            </h2>
            <p className='text-[#221D1D] text-sm font-abeezee mb-8'>
              You are about to delete your account, this would see your account
              removed from our database including all associated data. Are you
              sure you want to delete your account?
            </p>
            <div className='flex justify-between gap-4'>
              <button
                type='button'
                className='w-1/2 border border-[#EC4007] text-[#EC4007] hover:bg-[#FEEAE6] rounded-full py-4 font-abeezee text-base'
                onClick={handleDeleteAccountCancel}
              >
                Cancel
              </button>
              <button
                type='button'
                className='w-1/2 bg-[#EC4007] text-white rounded-full py-4 font-abeezee text-base'
                onClick={handleDeleteAccountConfirm}
              >
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}
      <Modal
        open={showDeleteReasonModal}
        onClose={handleDeleteReasonCancel}
        title='Delete account'
      >
        <div className='flex flex-col gap-4 p-2'>
          <h3 className='font-bold font-qilka text-lg mt-2 mb-1'>
            We are sorry to see you go
          </h3>
          <p className='text-xs text-[#4A413F] font-abeezee mb-2'>
            Help us improve Storytime by giving us the reason for wanting to
            leave.
          </p>
          <div className='flex flex-col gap-2'>
            {deleteReasons.map((reason) => (
              <label
                key={reason}
                className='flex items-center gap-2 cursor-pointer text-[#221D1D] font-abeezee text-base'
              >
                <input
                  type='radio'
                  name='delete-reason'
                  value={reason}
                  checked={deleteReason === reason}
                  onChange={() => setDeleteReason(reason)}
                />
                {reason}
              </label>
            ))}
            {deleteReason === 'Others' && (
              <textarea
                className='w-full mt-2 border rounded-2xl p-3 text-sm font-abeezee min-h-[60px]'
                placeholder='Please tell us why...'
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
              />
            )}
          </div>
          <button
            type='button'
            className={`w-full mt-8 rounded-full py-4 font-abeezee text-base ${
              deleteReason && (deleteReason !== 'Others' || otherReason.trim())
                ? 'bg-[#EC4007] text-white'
                : 'bg-[#EC4007]/10 text-[#EC4007] cursor-not-allowed'
            }`}
            disabled={
              !(
                deleteReason &&
                (deleteReason !== 'Others' || otherReason.trim())
              )
            }
            onClick={handleDeleteReasonProceed}
          >
            Proceed
          </button>
        </div>
      </Modal>
      {showConfirmDeleteModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30'>
          <div className='bg-white rounded-4xl shadow-lg p-8 w-full max-w-md mx-4 relative'>
            <div className='flex items-center justify-between'>
              <h2 className='text-[#221D1D] text-base font-abeezee'>
                Confirm account deletion
              </h2>
              <button
                className='text-xl text-gray-400 hover:text-gray-600'
                onClick={handleDeleteConfirmCancel}
                aria-label='Close'
              >
                &times;
              </button>
            </div>

            <div className='flex flex-col gap-4 p-2'>
              <p className='text-[#221D1D] text-sm font-abeezee mb-4'>
                To finalize your account deletion request, kindly provide your
                registered email address
              </p>
              <input
                type='email'
                className='w-full border rounded-full p-3 text-base font-abeezee mb-4'
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder='Enter your email address'
              />
              <div className='flex justify-between gap-4 mt-4'>
                <button
                  type='button'
                  className='w-1/2 border border-[#EC4007] text-[#EC4007] hover:bg-[#FEEAE6] rounded-full py-4 font-abeezee text-base'
                  onClick={handleDeleteConfirmCancel}
                >
                  Cancel
                </button>
                <button
                  type='button'
                  className='w-1/2 bg-[#EC4007] text-white rounded-full py-4 font-abeezee text-base'
                  onClick={handleDeleteConfirm}
                  disabled={!emailInput || emailInput !== user?.email}
                >
                  Delete account
                  <span className='ml-2'>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalSettingsPage;
