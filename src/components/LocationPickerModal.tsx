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
import { QUICK_NATIONWIDE_AREAS } from '../data/seedData';
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
      setFormError('지역명(구/동)을 입력하거나 아래 전국 주요 지역을 선택해 주세요.');
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1A1D1A]/55 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="내 등록 위치 변경"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[#F7F8F5] rounded-t-3xl sm:rounded-3xl border border-[#E8ECE4] shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-[#E8ECE4] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1A1D1A]">
              내 등록 위치 변경
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              등록된 위치를 탭하면 배달지와 추천 상권이 즉시 전환됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="위치 선택 닫기"
            className="w-9 h-9 rounded-xl bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#555E52] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Saved Locations List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-bold text-[#555E52]">
                등록된 위치 ({locations.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm((prev) => !prev);
                  setFormError(null);
                }}
                className="text-xs font-bold text-[#4E6E2A] hover:underline underline-offset-4 inline-flex items-center gap-1 cursor-pointer"
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
                        ? 'bg-[#EAF1E2] border-[#4E6E2A] shadow-[0_2px_10px_rgba(78,110,42,0.08)]'
                        : 'bg-white border-[#E8ECE4] hover:border-[#A8CC73]'
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
                            ? 'bg-[#4E6E2A] text-white'
                            : 'bg-[#EAF1E2] text-[#4E6E2A]'
                        }`}
                      >
                        <TagIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-[#1A1D1A]">
                            {loc.label}
                          </span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#4E6E2A]">
                              <Check className="w-3.5 h-3.5" />
                              현재 위치
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-[#4E6E2A] mt-0.5 truncate">
                          {loc.areaName}
                        </p>
                        <p className="text-[11px] text-[#687064] truncate">
                          {loc.detailAddress}
                        </p>
                      </div>
                    </button>

                    {locations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteLocation(loc.id)}
                        aria-label={`${loc.label} 위치 삭제`}
                        className="p-2 text-[#687064] hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0 cursor-pointer"
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
              className="bg-white border border-[#E8ECE4] rounded-2xl p-4 space-y-3"
            >
              <div className="text-xs font-bold text-[#1A1D1A]">
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
                          ? 'bg-[#4E6E2A] text-white border-[#4E6E2A]'
                          : 'bg-[#F7F8F5] text-[#555E52] border-[#E8ECE4] hover:border-[#82B440]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{TAG_META[tagKey].label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Nationwide Area Presets */}
              <div>
                <span className="block text-[11px] font-semibold text-[#687064] mb-1.5">
                  전국 주요 지역 빠른 입력
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_NATIONWIDE_AREAS.map((area) => {
                    const shortArea = area.replace(/^(서울|경기|인천|부산|대구|대전|광주)\s+/, '');
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setNewAreaName(area);
                          if (!newDetailAddress.trim()) {
                            setNewDetailAddress(`${shortArea} 수령지`);
                          }
                          setFormError(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                          newAreaName === area
                            ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#4E6E2A] font-bold'
                            : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#555E52] hover:border-[#82B440]'
                        }`}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#555E52] mb-1">
                    위치 별칭
                  </label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="예: 헬스장, 부모님 댁"
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-xs bg-white text-[#1A1D1A]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#555E52] mb-1">
                    지역명 (시/구/동) *
                  </label>
                  <input
                    type="text"
                    value={newAreaName}
                    onChange={(e) => {
                      setNewAreaName(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="예: 서울 강남구 역삼동"
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-xs bg-white text-[#1A1D1A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#555E52] mb-1">
                  상세 수령지 표기
                </label>
                <input
                  type="text"
                  value={newDetailAddress}
                  onChange={(e) => setNewDetailAddress(e.target.value)}
                  placeholder="예: 역삼동 수령지 B (1층 로비)"
                  className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-xs bg-white text-[#1A1D1A]"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer transition-colors"
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
