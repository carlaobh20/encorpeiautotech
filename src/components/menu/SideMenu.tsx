import { useEffect, useState } from 'react';
import { useVehicleStore } from '../../stores/vehicleStore';
import { useVehicleProfileStore } from '../../stores/vehicleProfileStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';

/**
 * Menu Lateral — centro de configuração do app.
 *
 * "Meu veículo", "Consumo e bateria", "Carregamento", "Perfil de condução",
 * "Uso do veículo" e "Aparência" são reais: cada campo lê/escreve no
 * Supabase (autosave debounced) e alimenta direto o cálculo do copiloto —
 * não são só texto guardado sem efeito. As demais linhas do mockup
 * aparecem — a estrutura completa fica visível — mas abrem um aviso
 * honesto de "em breve" em vez de fingir função. Nenhuma delas foi
 * construída ainda porque cada uma exige ou uma decisão de produto que só
 * o Carlos pode tomar (ex: o que "Backup e sincronização" deve fazer de
 * fato) ou infraestrutura que o app não tem hoje (ex: notificações push).
 */

type View =
  | 'menu'
  | 'meu-veiculo'
  | 'consumo-bateria'
  | 'carregamento'
  | 'perfil-conducao'
  | 'uso-veiculo'
  | 'aparencia'
  | 'ajuda'
  | 'sobre'
  | 'em-breve';

interface MenuItem {
  label: string;
  view: View;
}

interface MenuCategory {
  title: string;
  items: MenuItem[];
}

const CATEGORIES: MenuCategory[] = [
  {
    title: 'Planejamento',
    items: [
      { label: 'Planejamento de rota', view: 'em-breve' },
      { label: 'Carregamento', view: 'carregamento' },
      { label: 'Consumo e bateria', view: 'consumo-bateria' },
    ],
  },
  {
    title: 'Veículo',
    items: [
      { label: 'Meu veículo', view: 'meu-veiculo' },
      { label: 'Perfil de condução', view: 'perfil-conducao' },
      { label: 'Uso do veículo', view: 'uso-veiculo' },
    ],
  },
  {
    title: 'Conta e Dados',
    items: [
      { label: 'Backup e sincronização', view: 'em-breve' },
      { label: 'Histórico de viagens', view: 'em-breve' },
      { label: 'Importar/exportar', view: 'em-breve' },
    ],
  },
  {
    title: 'Aplicativo',
    items: [
      { label: 'Unidades e idioma', view: 'em-breve' },
      { label: 'Notificações', view: 'em-breve' },
      { label: 'Aparência', view: 'aparencia' },
    ],
  },
  {
    title: '',
    items: [
      { label: 'Ajuda e suporte', view: 'ajuda' },
      { label: 'Sobre o app', view: 'sobre' },
    ],
  },
];

export function SideMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>('menu');
  const [pendingLabel, setPendingLabel] = useState('');
  const data = useVehicleStore((s) => s.data);
  const status = useVehicleStore((s) => s.status);
  const displayName = useVehicleProfileStore((s) => s.displayName);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setView('menu'), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  function openItem(item: MenuItem) {
    if (item.view === 'em-breve') {
      setPendingLabel(item.label);
      setView('em-breve');
      return;
    }
    setView(item.view);
  }

  const statusLabel =
    status.state === 'connected'
      ? 'OBD conectado'
      : status.sourceKind === 'mock'
      ? 'Simulação (?source=mock)'
      : 'Aguardando gateway';

  return (
    <>
      {open && <div className="side-menu-backdrop" onClick={onClose} />}
      <aside className={`side-menu${open ? ' side-menu-open' : ''}`}>
        <div className="side-menu-header">
          <div className="side-menu-vehicle">
            <span className="side-menu-vehicle-name">{displayName}</span>
            <span className="side-menu-vehicle-sub">
              {data.soc !== null ? Math.round(data.soc) + '%' : '—'} · {statusLabel}
            </span>
          </div>
          <button className="side-menu-close" onClick={onClose} aria-label="Fechar menu">✕</button>
        </div>

        <div className="side-menu-body">
          {view === 'menu' &&
            CATEGORIES.map((cat) => (
              <div className="side-menu-cat" key={cat.title || 'outros'}>
                {cat.title && <div className="side-menu-cat-title">{cat.title}</div>}
                {cat.items.map((item) => (
                  <button key={item.label} className="side-menu-item" onClick={() => openItem(item)}>
                    <span>{item.label}</span>
                    <span className="side-menu-item-caret">›</span>
                  </button>
                ))}
              </div>
            ))}

          {view === 'meu-veiculo' && <MeuVeiculoView onBack={() => setView('menu')} />}
          {view === 'consumo-bateria' && <ConsumoBateriaView onBack={() => setView('menu')} />}
          {view === 'carregamento' && <CarregamentoView onBack={() => setView('menu')} />}
          {view === 'perfil-conducao' && <PerfilConducaoView onBack={() => setView('menu')} />}
          {view === 'uso-veiculo' && <UsoVeiculoView onBack={() => setView('menu')} />}
          {view === 'aparencia' && <AparenciaView onBack={() => setView('menu')} />}
          {view === 'ajuda' && <AjudaView onBack={() => setView('menu')} />}
          {view === 'sobre' && <SobreView onBack={() => setView('menu')} />}
          {view === 'em-breve' && <EmBreveView label={pendingLabel} onBack={() => setView('menu')} />}
        </div>
      </aside>
    </>
  );
}

function BackRow({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="side-menu-subhead">
      <button className="side-menu-back" onClick={onBack}>‹ Voltar</button>
      <span className="side-menu-subhead-title">{title}</span>
    </div>
  );
}

function EmBreveView({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div>
      <BackRow onBack={onBack} title={label} />
      <p className="side-menu-empty">Essa área ainda não está implementada. Em breve.</p>
    </div>
  );
}

function SobreView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <BackRow onBack={onBack} title="Sobre o app" />
      <p className="side-menu-about">
        Encorpei Auto — copiloto de energia para EVs.
        <br />
        Telemetria via Vehicle Gateway · GAC Aion UT + Vgate iCar Pro.
        <br />
        ?source=mock para demonstração sem carro.
      </p>
    </div>
  );
}

function AjudaView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <BackRow onBack={onBack} title="Ajuda e suporte" />
      <p className="side-menu-about">
        Dúvida ou algo quebrou? Fale direto com o Carlos pelo e-mail
        carloshenriqueferro@gmail.com descrevendo o que aconteceu — se
        possível com um print da tela.
      </p>
      <p className="side-menu-note">
        Ainda não existe um canal de suporte dedicado dentro do app (chat,
        base de artigos etc.) — por enquanto é contato direto mesmo.
      </p>
    </div>
  );
}

function MeuVeiculoView({ onBack }: { onBack: () => void }) {
  const displayName = useVehicleProfileStore((s) => s.displayName);
  const batteryCapacityKwh = useVehicleProfileStore((s) => s.batteryCapacityKwh);
  const nominalKmPerKwh = useVehicleProfileStore((s) => s.nominalKmPerKwh);
  const saving = useVehicleProfileStore((s) => s.saving);
  const loaded = useVehicleProfileStore((s) => s.loaded);
  const update = useVehicleProfileStore((s) => s.update);

  return (
    <div>
      <BackRow onBack={onBack} title="Meu veículo" />
      {!loaded && <p className="side-menu-empty">Carregando…</p>}

      <div className="side-menu-field">
        <label>Nome / modelo</label>
        <input
          className="side-menu-input"
          value={displayName}
          onChange={(e) => update({ displayName: e.target.value })}
        />
      </div>

      <div className="side-menu-field">
        <label>Capacidade da bateria (kWh)</label>
        <input
          className="side-menu-input"
          type="number"
          min={10}
          max={200}
          step={0.1}
          value={batteryCapacityKwh}
          onChange={(e) => update({ batteryCapacityKwh: Number(e.target.value) })}
        />
      </div>

      <div className="side-menu-field">
        <label>Consumo nominal (km/kWh)</label>
        <input
          className="side-menu-input"
          type="number"
          min={1}
          max={15}
          step={0.1}
          value={nominalKmPerKwh}
          onChange={(e) => update({ nominalKmPerKwh: Number(e.target.value) })}
        />
      </div>

      <div className="side-menu-save-hint">{saving ? 'Salvando…' : 'Salvo automaticamente'}</div>
      <p className="side-menu-note">
        Esses valores alimentam direto o cálculo de autonomia — mudou aqui, muda a previsão na hora.
      </p>
    </div>
  );
}

function ConsumoBateriaView({ onBack }: { onBack: () => void }) {
  const reserveSocPct = useAppSettingsStore((s) => s.reserveSocPct);
  const saving = useAppSettingsStore((s) => s.saving);
  const loaded = useAppSettingsStore((s) => s.loaded);
  const update = useAppSettingsStore((s) => s.update);

  return (
    <div>
      <BackRow onBack={onBack} title="Consumo e bateria" />
      {!loaded && <p className="side-menu-empty">Carregando…</p>}

      <div className="side-menu-field">
        <label>Reserva mínima de bateria (%)</label>
        <input
          className="side-menu-input"
          type="number"
          min={0}
          max={40}
          step={1}
          value={reserveSocPct}
          onChange={(e) => update({ reserveSocPct: Number(e.target.value) })}
        />
      </div>

      <div className="side-menu-save-hint">{saving ? 'Salvando…' : 'Salvo automaticamente'}</div>
      <p className="side-menu-note">
        É a % de bateria que o copiloto trata como intocável — abaixo disso ele avisa que é preciso
        recarregar. Vale pro planejamento de rota e pro alerta durante a navegação.
      </p>
    </div>
  );
}

function CarregamentoView({ onBack }: { onBack: () => void }) {
  const energyTariffBrlKwh = useAppSettingsStore((s) => s.energyTariffBrlKwh);
  const gasPriceBrlL = useAppSettingsStore((s) => s.gasPriceBrlL);
  const gasKmPerL = useAppSettingsStore((s) => s.gasKmPerL);
  const saving = useAppSettingsStore((s) => s.saving);
  const loaded = useAppSettingsStore((s) => s.loaded);
  const update = useAppSettingsStore((s) => s.update);

  return (
    <div>
      <BackRow onBack={onBack} title="Carregamento" />
      {!loaded && <p className="side-menu-empty">Carregando…</p>}

      <div className="side-menu-field">
        <label>Tarifa de energia (R$/kWh)</label>
        <input
          className="side-menu-input"
          type="number"
          min={0}
          max={5}
          step={0.01}
          value={energyTariffBrlKwh}
          onChange={(e) => update({ energyTariffBrlKwh: Number(e.target.value) })}
        />
      </div>

      <div className="side-menu-field">
        <label>Preço da gasolina (R$/L)</label>
        <input
          className="side-menu-input"
          type="number"
          min={0}
          max={15}
          step={0.01}
          value={gasPriceBrlL}
          onChange={(e) => update({ gasPriceBrlL: Number(e.target.value) })}
        />
      </div>

      <div className="side-menu-field">
        <label>Consumo do carro a gasolina (km/L)</label>
        <input
          className="side-menu-input"
          type="number"
          min={1}
          max={30}
          step={0.1}
          value={gasKmPerL}
          onChange={(e) => update({ gasKmPerL: Number(e.target.value) })}
        />
      </div>

      <div className="side-menu-save-hint">{saving ? 'Salvando…' : 'Salvo automaticamente'}</div>
      <p className="side-menu-note">
        Usados no resumo de viagem pra calcular quanto você gastou de energia e quanto teria gasto
        com um carro a combustão equivalente.
      </p>
    </div>
  );
}

const DRIVING_PROFILES: { value: 'eco' | 'normal' | 'esportivo'; label: string; hint: string }[] = [
  { value: 'eco', label: 'Eco', hint: '−10% consumo' },
  { value: 'normal', label: 'Normal', hint: 'sem ajuste' },
  { value: 'esportivo', label: 'Esportivo', hint: '+15% consumo' },
];

function PerfilConducaoView({ onBack }: { onBack: () => void }) {
  const drivingProfile = useAppSettingsStore((s) => s.drivingProfile);
  const saving = useAppSettingsStore((s) => s.saving);
  const loaded = useAppSettingsStore((s) => s.loaded);
  const update = useAppSettingsStore((s) => s.update);

  return (
    <div>
      <BackRow onBack={onBack} title="Perfil de condução" />
      {!loaded && <p className="side-menu-empty">Carregando…</p>}

      <div className="side-menu-field">
        <label>Estilo de condução</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {DRIVING_PROFILES.map((p) => (
            <button
              key={p.value}
              onClick={() => update({ drivingProfile: p.value })}
              style={{
                flex: 1,
                padding: '10px 6px',
                borderRadius: 12,
                border: drivingProfile === p.value ? '1px solid var(--teal)' : '1px solid var(--glass-border)',
                background: drivingProfile === p.value ? 'rgba(61,220,196,0.12)' : 'var(--glass)',
                color: 'var(--text)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 600 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="side-menu-save-hint">{saving ? 'Salvando…' : 'Salvo automaticamente'}</div>
      <p className="side-menu-note">
        Ajusta a previsão de consumo pro seu jeito de dirigir — eco assume aceleração suave e uso
        eficiente da regeneração; esportivo assume acelerações mais fortes e velocidade média mais alta.
        Se você ajustar carga/clima manualmente numa viagem específica, esse ajuste manual manda mais
        que o perfil padrão.
      </p>
    </div>
  );
}

function UsoVeiculoView({ onBack }: { onBack: () => void }) {
  const extraLoadKg = useAppSettingsStore((s) => s.extraLoadKg);
  const saving = useAppSettingsStore((s) => s.saving);
  const loaded = useAppSettingsStore((s) => s.loaded);
  const update = useAppSettingsStore((s) => s.update);

  return (
    <div>
      <BackRow onBack={onBack} title="Uso do veículo" />
      {!loaded && <p className="side-menu-empty">Carregando…</p>}

      <div className="side-menu-field">
        <label>Carga extra média (kg)</label>
        <input
          className="side-menu-input"
          type="number"
          min={0}
          max={400}
          step={5}
          value={extraLoadKg}
          onChange={(e) => update({ extraLoadKg: Number(e.target.value) })}
        />
      </div>

      <div className="side-menu-save-hint">{saving ? 'Salvando…' : 'Salvo automaticamente'}</div>
      <p className="side-menu-note">
        Peso médio de passageiros/bagagem além de 1 pessoa, no seu uso normal do carro (ex.: família,
        equipamento de trabalho). Entra como padrão em toda previsão — numa viagem específica com carga
        diferente, ajuste na tela de planejamento em vez de mudar aqui.
      </p>
    </div>
  );
}

const ACCENT_PRESETS = ['#3ddcc4', '#7fb4ff', '#ffb04a', '#c792ea', '#ff6b9d'];

function AparenciaView({ onBack }: { onBack: () => void }) {
  const themeAccent = useAppSettingsStore((s) => s.themeAccent);
  const saving = useAppSettingsStore((s) => s.saving);
  const loaded = useAppSettingsStore((s) => s.loaded);
  const update = useAppSettingsStore((s) => s.update);

  return (
    <div>
      <BackRow onBack={onBack} title="Aparência" />
      {!loaded && <p className="side-menu-empty">Carregando…</p>}

      <div className="side-menu-field">
        <label>Cor de destaque</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => update({ themeAccent: c })}
              aria-label={'Cor ' + c}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: c,
                border: themeAccent.toLowerCase() === c.toLowerCase() ? '3px solid var(--text)' : '2px solid var(--glass-border)',
                cursor: 'pointer',
              }}
            />
          ))}
          <input
            type="color"
            value={themeAccent}
            onChange={(e) => update({ themeAccent: e.target.value })}
            style={{ width: 34, height: 34, border: 'none', background: 'none', cursor: 'pointer' }}
            aria-label="Cor personalizada"
          />
        </div>
      </div>

      <div className="side-menu-save-hint">{saving ? 'Salvando…' : 'Salvo automaticamente'}</div>
      <p className="side-menu-note">
        Muda a cor de destaque usada em botões, ícones e indicadores positivos no app inteiro.
      </p>
    </div>
  );
}
