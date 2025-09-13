import { getKidsService, addKidsService } from '@/lib/services';
import { useState, useEffect } from 'react';
import kid1 from '@/public/kid-3.svg';
import kid2 from '@/public/kid-4.svg';
import kid3 from '@/public/kid-3.svg';
import kid4 from '@/public/kid-4.svg';
import Image from 'next/image';
import Modal from './ui/modal'; // Import Modal
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const KidPicker = ({
  onKidSelect,
}: {
  onKidSelect: (kidId: string) => void;
}) => {
  const [kids, setKids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultAvatars = [kid1, kid2, kid3, kid4];
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    avatarUrl: '',
    ageRange: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchKids();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchKids = async () => {
    setLoading(true);
    try {
      const kidsData = await getKidsService();
      const mappedKids = kidsData.map((kid: Kid, index: number) => ({
        id: kid.id,
        name: kid.name,
        age: `${kid.ageRange} yrs`,
        cstories: '0 Stories completed',
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

  const handleKidSelect = (kid: Kid) => {
    setSelectedKidId(kid.id);
    localStorage.setItem('selectedKid', JSON.stringify(kid));
    onKidSelect(kid.id);
  };

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      await addKidsService([
        {
          name: form.name,
          avatarUrl: form.avatarUrl,
          ageRange: form.ageRange,
        },
      ]);
      setModalOpen(false);
      setForm({ name: '', avatarUrl: '', ageRange: '' });
      fetchKids();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to add child');
    } finally {
      setFormLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const selectedFile = files[0];
      const url = URL.createObjectURL(selectedFile);
      setForm((prevForm) => ({
        ...prevForm,
        avatarUrl: url,
      }));
    }
  };

  return (
    <div>
      <div className='flex items-center justify-between mt-10'>
        <div className=''>
          <h2 className='text-[#221D1D] text-xl not-italic font-bold leading-6 font-qilka'>
            YOUR KIDS
          </h2>
          <p className='text-[#4A413F] text-base not-italic font-normal leading-5'>
            Select a child and start enjoying unlimited stories
          </p>
        </div>
        <button
          className='bg-[#EC4007] text-white rounded-[3.12rem] py-3 px-6 font-abeezee text-base'
          onClick={() => setModalOpen(true)}
        >
          Add child
        </button>
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-8 mt-8'>
        {kids.map((kid) => (
          <div
            key={kid.id}
            className={`cursor-pointer transition-all duration-200 border-[0.5px] overflow-hidden rounded-2xl
        ${
          selectedKidId === kid.id
            ? 'bg-[#EC4007] shadow-[0px_0px_0px_4px_rgba(236,64,7,0.15)] rounded-3xl border-[#F84020] text-white'
            : 'bg-white shadow-[0px_0px_17px_0px_rgba(34,29,29,0.05)] border-stone-100'
        }
      `}
            onClick={() => handleKidSelect(kid)}
          >
            <div className='w-full h-48 bg-gray-100 flex items-center justify-center'>
              <Image
                src={kid.img}
                alt={kid.name}
                width={400}
                height={200}
                className='object-cover w-full h-full'
              />
            </div>
            <div className='p-6'>
              <p className='text-[#EC4007] text-sm font-abeezee mb-1'>
                0 Stories completed
              </p>
              <h3 className='text-[#221D1D] text-2xl font-bold font-qilka mb-1'>
                {kid.name}
              </h3>
              <p className='text-[#221D1D] text-base font-abeezee'>{kid.age}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Modal for Add Child */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title='Add Child'
      >
        <div className='flex flex-col gap-6 min-h-[80vh] justify-between'>
          <div>
            <div className='flex gap-4 items-center mb-6 mt-2'>
              <div className='w-16 h-16 rounded-full bg-[#FFF6F3] flex items-center justify-center mb-2'>
                {/* Avatar image or fallback icon */}
                {form.avatarUrl ? (
                  <img
                    src={form.avatarUrl}
                    alt='avatar'
                    className='w-16 h-16 rounded-full object-cover'
                  />
                ) : (
                  <svg width='68' height='68' viewBox='0 0 48 48' fill='none'>
                    <circle
                      cx='24'
                      cy='24'
                      r='24'
                      fill='#EC4007'
                      fillOpacity='0.15'
                    />
                    <circle cx='24' cy='20' r='8' fill='#EC4007' />
                    <ellipse cx='24' cy='34' rx='12' ry='7' fill='#EC4007' />
                  </svg>
                )}
              </div>
              <div className='relative'>
                <input
                  type='file'
                  className='absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer'
                  onChange={handleFileChange}
                />
                <button
                  type='button'
                  className='text-[#0731EC] text-sm font-abeezee cursor-pointer'
                >
                  Change image
                </button>
              </div>
            </div>

            <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
              Name
            </label>
            <Input
              className='border rounded px-3 py-2 w-full'
              type='text'
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder='Enter child name'
              required
            />
            <div className='mt-6'>
              <label className='block mb-1 text-[#4A413F] text-sm font-abeezee'>
                Age
              </label>
              <Select
                value={form.ageRange}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, ageRange: value }))
                }
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
            <button
              type='button'
              className='w-1/2 border border-[#EC4007] text-[#EC4007] hover:bg-[#FEEAE6] rounded-full py-4 font-abeezee text-base'
              onClick={() => setModalOpen(false)}
            >
              Close
            </button>
            <button
              type='submit'
              className='w-1/2 bg-[#EC4007] text-white rounded-full py-4 font-abeezee text-base'
              disabled={formLoading}
              onClick={handleAddChild}
            >
              {formLoading ? 'Saving...' : 'Save child'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default KidPicker;
