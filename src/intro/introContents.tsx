export function MarketIntroContent() {
  return (
    <>
      <p>
        Это <strong className="text-zinc-100">демо-портфель</strong> с виртуальными деньгами: на экране{' '}
        <strong className="text-zinc-100">Маркет</strong> вы можете покупать и продавать акции по текущим котировкам
        (нажмите «Обновить», чтобы подтянуть актуальные цены).
      </p>
      <p>
        Когда соберёте позиции и нажмёте <strong className="text-zinc-100">«Подтвердить портфель»</strong>, откроется
        раздел <strong className="text-zinc-100">Портфель</strong> — там можно проанализировать результат: график
        стоимости, доходность и риск-тест.
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-zinc-300 marker:text-zinc-500">
        <li>
          <strong className="text-zinc-200">Маркет</strong> — выбор бумаг и сделки
        </li>
        <li>
          <strong className="text-zinc-200">Портфель</strong> — анализ итогов
        </li>
      </ul>
    </>
  );
}

export function PortfolioIntroContent() {
  return (
    <>
      <p>
        Здесь отображается ваш <strong className="text-zinc-100">демо-портфель</strong>: позиции, доходность и график
        стоимости во времени. Цены и состав можно обновить кнопкой <strong className="text-zinc-100">«Обновить»</strong>{' '}
        — сделки на продажу ориентируются на актуальные котировки.
      </p>
      <p>
        На экране <strong className="text-zinc-100">Маркет</strong> вы набирали бумаги; здесь — итог: анализ результата,
        распределение по секторам и переход к <strong className="text-zinc-100">риск-тесту</strong>, когда портфель
        подтверждён.
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-zinc-300 marker:text-zinc-500">
        <li>
          <strong className="text-zinc-200">Позиции</strong> — докупка и продажа лотов
        </li>
        <li>
          <strong className="text-zinc-200">График и метрики</strong> — динамика и оценка риска
        </li>
      </ul>
    </>
  );
}

export function ForecastIntroContent() {
  return (
    <>
      <p>
        Наш прогноз — это не предсказание, а математическая модель. Мы анализируем тысячи возможных сценариев развития
        ваших инвестиций, чтобы показать наиболее вероятный результат.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-zinc-300 marker:text-zinc-500">
        <li>
          <strong className="text-zinc-100">Белая линия</strong> — это средний, наиболее вероятный сценарий.
        </li>
        <li>
          <strong className="text-zinc-100">Зелёная и красная линии</strong> показывают вероятный коридор, в котором может
          оказаться ваш капитал.
        </li>
      </ul>
    </>
  );
}
