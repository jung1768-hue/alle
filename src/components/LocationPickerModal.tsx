import { useState } from 'react';
import {
  Briefcase,
  Check,
  Home,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { QUICK_DAEGU_AREAS } from '../data/seedData';
import { SavedLocation } from '../types/alle';

interface LocationPickerModalProps {
  isOpen: boolean;
  locations: SavedLocation[];
  selectedLocationId: string;
  onSelectLocation: (locationId: string) => void;
  onAddLocation: (payload: Omit<SavedLocation, 'id'>) => void;
  onDeleteLocation: (locationId: string) => void;
  onClose: () => void;
}

const TAG_META: Record<
  SavedLocation['tag'],
  { label: string; icon: typeof Home }
> = {
  home: { label: '우리집', icon: Home },
  work: { label: '회사', icon: Briefcase },
  etc: { label: '기타', icon: MapPin },
};

export function LocationPickerModal({
  isOpen,
  locations,
  selectedLocationId,
  onSelectLocation,
  onAddLocation,
  onDeleteLocation,
  onClose,
}: LocationPickerModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTag, setNewTag] = useState<SavedLocation['tag']>('etc');
  const [newLabel, setNewLabel] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [newDetailAddress, setNewDetailAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedArea = newAreaName.trim();
    if (!cleanedArea) {
      setFormError('지역명(동/구)을 입력하거나 아래 대구 주요 상권을 선택해 주세요.');
      return;
    }
    const cleanedLabel =
      newLabel.trim() ||
      (newTag === 'home' ? '우리집' : newTag === 'work' ? '회사' : cleanedArea.split(' ').pop() || '내 위치');
    const cleanedDetail = newDetailAddress.trim() || `${cleanedArea} 수령지`;

    onAddLocation({
      label: cleanedLabel,
      areaName: cleanedArea,
      detailAddress: cleanedDetail,
      tag: newTag,
    });

    setNewLabel('');
    setNewAreaName('');
    setNewDetailAddress('');
    setNewTag('etc');
    setFormError(null);
    setShowAddForm(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#141812]/55 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="내 등록 위치 변경"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[#F4F6F1] rounded-t-3xl sm:rounded-3xl border border-[#DDE3D7] shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-[#E5EAE0] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#141812]">
              내 등록 위치 변경
            </h2>
            <p className="text-xs text-[#4A5246] mt-0.5">
              등록된 위치를 탭하면 배달지와 추천 상권이 즉시 전환됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="위치 선택 닫기"
            className="w-9 h-9 rounded-xl bg-[#F4F6F1] hover:bg-[#E7EFE1] text-[#374033] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Saved Locations List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-bold text-[#374033]">
                등록된 위치 ({locations.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm((prev) => !prev);
                  setFormError(null);
                }}
                className="text-xs font-bold text-[#2E531A] hover:underline underline-offset-4 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddForm ? '등록 닫기' : '새 위치 추가'}</span>
              </button>
            </div>

            <div className="space-y-2">
              {locations.map((loc) => {
                const isSelected = loc.id === selectedLocationId;
                const TagIcon = TAG_META[loc.tag].icon;
                return (
                  <div
                    key={loc.id}
                    className={`rounded-2xl border transition-all flex items-center justify-between gap-2 p-3.5 ${
                      isSelected
                        ? 'bg-[#EFF5E6] border-[#2E531A] shadow-[0_2px_10px_rgba(46,83,26,0.08)]'
                        : 'bg-white border-[#DDE3D7] hover:border-[#A8C190]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectLocation(loc.id);
                        onClose();
                      }}
                      className="flex-1 flex items-start gap-3 text-left min-w-0 cursor-pointer"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-[#2E531A] text-white'
                            : 'bg-[#EFF5E6] text-[#2E531A]'
                        }`}
                      >
                        <TagIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-[#141812]">
                            {loc.label}
                          </span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#2E531A]">
                              <Check className="w-3.5 h-3.5" />
                              현재 위치
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-[#2E531A] mt-0.5 truncate">
                          {loc.areaName}
                        </p>
                        <p className="text-[11px] text-[#4A5246] truncate">
                          {loc.detailAddress}
                        </p>
                      </div>
                    </button>

                    {locations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteLocation(loc.id)}
                        aria-label={`${loc.label} 위치 삭제`}
                        className="p-2 text-[#717870] hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add New Location Form */}
          {showAddForm && (
            <form
              onSubmit={handleSubmitNew}
              className="bg-white border border-[#CBDCC0] rounded-2xl p-4 space-y-3"
            >
              <div className="text-xs font-bold text-[#141812]">
                새 위치 등록
              </div>

              {formError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
                >
                  {formError}
                </p>
              )}

              {/* Category Tag Selector */}
              <div className="grid grid-cols-3 gap-2">
                {(['home', 'work', 'etc'] as const).map((tagKey) => {
                  const Icon = TAG_META[tagKey].icon;
                  const active = newTag === tagKey;
                  return (
                    <button
                      key={tagKey}
                      type="button"
                      onClick={() => setNewTag(tagKey)}
                      className={`min-h-[38px] px-2 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#2E531A] text-white border-[#2E531A]'
                          : 'bg-[#F4F6F1] text-[#374033] border-[#DDE3D7] hover:border-[#79A92C]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{TAG_META[tagKey].label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Daegu Area Presets */}
              <div>
                <span className="block text-[11px] font-semibold text-[#4A5246] mb-1.5">
                  대구 주요 지역 빠른 입력
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_DAEGU_AREAS.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => {
                        setNewAreaName(area);
                        if (!newDetailAddress.trim()) {
                          setNewDetailAddress(`${area.replace(/^대구\s+/, '')} 수령지`);
                        }
                        setFormError(null);
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                        newAreaName === area
                          ? 'bg-[#EFF5E6] border-[#2E531A] text-[#2E531A] font-bold'
                          : 'bg-[#F7F8F5] border-[#DDE3D7] text-[#374033] hover:border-[#79A92C]'
                      }`}
                    >
                      {area.replace(/^대구\s+/, '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#374033] mb-1">
                    위치 별칭
                  </label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="예: 헬스장, 부모님 댁"
                    className="w-full min-h-[40px] px-3 border border-[#CBDCC0] rounded-xl text-xs bg-white text-[#141812]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#374033] mb-1">
                    지역명 (구/동) *
                  </label>
                  <input
                    type="text"
                    value={newAreaName}
                    onChange={(e) => {
                      setNewAreaName(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="예: 대구 중구 대봉동"
                    className="w-full min-h-[40px] px-3 border border-[#CBDCC0] rounded-xl text-xs bg-white text-[#141812]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#374033] mb-1">
                  상세 수령지 표기
                </label>
                <input
                  type="text"
                  value={newDetailAddress}
                  onChange={(e) => setNewDetailAddress(e.target.value)}
                  placeholder="예: 대봉동 수령지 B (1층 로비)"
                  className="w-full min-h-[40px] px-3 border border-[#CBDCC0] rounded-xl text-xs bg-white text-[#141812]"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer transition-colors"
              >
                위치 등록하고 바로 적용
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
