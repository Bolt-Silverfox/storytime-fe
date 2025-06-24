import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import close from '@/public/close.svg';
import expandIcon from '@/public/expand.svg';
import Image from 'next/image';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  expandable?: boolean;
  setExpand?: (expand: boolean) => void;
  expand?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  expandable = false,
  setExpand,
  expand,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='fixed inset-0 z-50 flex items-center justify-end'
          initial={{ backgroundColor: 'rgba(34, 29, 29, 0)' }}
          animate={{ backgroundColor: 'rgba(34, 29, 29, 0.7)' }}
          exit={{ backgroundColor: 'rgba(34, 29, 29, 0)' }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          aria-modal='true'
          role='dialog'
        >
          <motion.div
            className={`relative border-stone-100 bg-white ${
              expand ? 'w-[70vw] ' : 'w-[32vw]'
            } p-8 rounded-[1.8125rem] border-[0.5px] border-solid mr-3 h-[95vh] font-abeezee overflow-y-auto scrollbar transition-all duration-100 ease-in-out`}
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            // transition={{
            //   type: 'spring',
            //   damping: 25,
            //   stiffness: 200,
            //   duration: 0.3,
            // }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex justify-between items-center mb-10'>
              {title && (
                <h2 className='text-[#221D1D] text-base not-italic font-normal leading-5'>
                  {title}
                </h2>
              )}
              <div className='flex justify-between items-center gap-8'>
                {expandable && (
                  <div
                    onClick={() => setExpand?.(!expand)}
                    className='border-stone-100 cursor-pointer hover:scale-105 transition-all duration-300 bg-white shadow-[0px_0px_17px_0px_rgba(236,64,7,0.10)] p-2 px-3 rounded-[3.125rem] border-[0.5px] border-solid flex items-center gap-2'
                  >
                    <Image src={expandIcon} alt='expand' />
                    <p className='text-[#221D1D] text-base not-italic font-normal leading-5'>
                      Expand
                    </p>
                  </div>
                )}
                <Image
                  src={close}
                  alt='close'
                  onClick={onClose}
                  className='cursor-pointer hover:scale-105 transition-all duration-300'
                />
              </div>
            </div>
            <div>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
