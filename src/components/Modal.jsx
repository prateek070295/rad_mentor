import React from 'react';

const Modal = ({ isOpen, onClose, children, title = "Modal" }) => {
  if (!isOpen) {
    return null;
  }

  return (
    // Backdrop
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center"
      onClick={onClose}
    >
      {/* Modal Content */}
      <div
        className="bg-white rounded-xl shadow-2xl z-50 w-full max-w-5xl max-h-[90vh] mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold">{title}</h2>
          <button 
            onClick={onClose}
            className="text-2xl font-bold text-gray-500 hover:text-gray-800"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
