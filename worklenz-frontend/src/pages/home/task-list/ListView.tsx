import { useAppSelector } from '@/hooks/useAppSelector';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { setHomeTasksConfig } from '@/features/home-page/home-page.slice';
import PillToggle from '../PillToggle';

type HomeTaskTab = 'All' | 'Today' | 'Overdue';

const HOME_TASK_TABS: HomeTaskTab[] = ['All', 'Today', 'Overdue'];

/** The Overview only offers All / Today / Overdue; any other stored tab falls back to All. */
export const toHomeTaskTab = (value?: string | null): HomeTaskTab =>
  HOME_TASK_TABS.includes(value as HomeTaskTab) ? (value as HomeTaskTab) : 'All';

interface ListViewProps {
  refetch: () => void;
}

const ListView = ({ refetch }: ListViewProps) => {
  const { t } = useTranslation('home');
  const dispatch = useAppDispatch();

  const { homeTasksConfig } = useAppSelector(state => state.homePageReducer);

  const tabOptions: { value: HomeTaskTab; label: string }[] = [
    { value: 'All', label: t('tasks.all', { defaultValue: 'All' }) },
    { value: 'Today', label: t('homeCalendar.todayButton', { defaultValue: 'Today' }) },
    { value: 'Overdue', label: t('tasks.overdue', { defaultValue: 'Overdue' }) },
  ];

  return (
    <PillToggle<HomeTaskTab>
      value={toHomeTaskTab(homeTasksConfig.current_tab)}
      options={tabOptions}
      onChange={key => {
        dispatch(setHomeTasksConfig({ ...homeTasksConfig, current_tab: key }));
        refetch();
      }}
    />
  );
};

export default ListView;
