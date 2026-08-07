import { Badge } from '../../../shared/ui/Badge';
import { Icon } from '../../../shared/ui/Icon';
import { SectionHeader } from '../../../shared/ui/SectionHeader';
import type { Place } from '../types';

type PlaceListProps = {
  places: Place[];
  status: 'loading' | 'success' | 'error';
  selectedPlaceId: string | null;
  onSelect: (place: Place) => void;
};

function getCategoryIcon(category: Place['category']) {
  if (category === 'CE7') return 'local_cafe';
  if (category === 'AT4') return 'park';
  if (category === 'SW8') return 'subway';
  if (category === 'SHOPPING') return 'storefront';
  if (category === 'ETC') return 'place';
  return 'restaurant';
}

export function PlaceList({ places, status, selectedPlaceId, onSelect }: PlaceListProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <SectionHeader
        eyebrow="EXPLORE"
        title="주변 장소"
        description={`역에서 가까운 장소 ${places.length}곳`}
        action={<Badge>반경 1km</Badge>}
        className="border-b border-outline-variant/70 px-md py-md"
      />

      {status === 'loading' ? (
        <div className="flex flex-1 items-center gap-sm p-md text-body-md text-on-surface-variant" role="status">
          <Icon name="progress_activity" className="animate-spin text-[22px]" /> 주변 장소를 불러오는 중입니다.
        </div>
      ) : status === 'error' ? (
        <div className="m-md flex flex-1 items-start gap-sm rounded-xl bg-error-container/45 p-md text-body-md text-error" role="alert">
          <Icon name="error_outline" className="text-[22px]" /> 주변 장소를 불러오지 못했습니다.
        </div>
      ) : places.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-sm p-lg text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
            <Icon name="location_off" className="text-[26px]" />
          </span>
          <p className="text-body-md text-on-surface-variant">표시할 주변 장소가 없습니다.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-sm overflow-y-auto p-sm">
          {places.map((place) => {
            const isSelected = selectedPlaceId === place.id;
            return (
              <li key={place.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(place)}
                  className={`flex w-full items-start gap-sm rounded-xl border p-md text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary-container/45 shadow-sm ring-1 ring-primary/15'
                      : 'border-outline-variant/70 bg-surface-bright hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-card'
                  }`}
                >
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isSelected ? 'bg-primary text-on-primary' : 'bg-primary-container text-primary'}`}>
                    <Icon name={getCategoryIcon(place.category)} className="text-[20px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-caps text-primary">{place.categoryName}</span>
                    <span className="mt-xs block truncate text-body-lg font-bold text-on-surface">{place.name}</span>
                    <span className="mt-xs block truncate text-body-md text-on-surface-variant">{place.address}</span>
                  </span>
                  <Icon name={isSelected ? 'check_circle' : 'chevron_right'} className={`mt-sm shrink-0 text-[19px] ${isSelected ? 'text-primary' : 'text-outline'}`} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
